jest.mock('node:fs', () => ({
    ...jest.requireActual('node:fs'),
    existsSync: () => true,
    readFileSync: jest.fn(),
}));
jest.mock('./extract-angular', () => ({ extractFeatureFlagsFromTemplate: jest.fn(() => []) }));

import { extractFeatureFlagsFromTs } from './extract-ts';
import { Context } from './models/context';
import * as ts from 'typescript';
import { Random } from 'random-test-values';
import { FlagRead } from './models/flag-read';
import { extractFeatureFlagsFromTemplate } from './extract-angular';
import * as fs from 'node:fs';
import { buildExecutorContext } from '../../test-utils';
import { LogLevel, Logger } from './logger';
import { Options } from './schema';
import { buildMockProjectService } from './testing/test-utils';

interface TestHost {
    ctx: Context;
    program: ts.Program;
    typeChecker: ts.TypeChecker;
}

function buildContext(): Context {
    const logger = new Logger(LogLevel.ERROR);
    const options: Options = { tsConfig: '/tsconfig.json' };
    return { ...buildExecutorContext(), projectRoot: '/', logger, options };
}

function buildTestHost(files: Record<string, string>): TestHost {
    const ctx = buildContext();

    const hostFiles = { ...files };

    const host: ts.CompilerHost = {
        //#region ModuleResolutionHost

        fileExists(fileName: string): boolean {
            return !!hostFiles[fileName];
        },

        readFile(fileName: string): string | undefined {
            return hostFiles[fileName];
        },

        //#endregion ModuleResolutionHost

        //#region CompilerHost

        getSourceFile(
            fileName: string,
            languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
            _onError?: (message: string) => void,
            _shouldCreateNewSourceFile?: boolean
        ): ts.SourceFile | undefined {
            const text = hostFiles[fileName] ?? '';
            const source = ts.createSourceFile(fileName, text, languageVersionOrOptions);
            return source;
        },

        getDefaultLibFileName(options: ts.CompilerOptions): string {
            return ts.getDefaultLibFileName(options);
        },

        writeFile: (fileName: string, text: string): void => {
            hostFiles[fileName] = text;
        },

        getCurrentDirectory(): string {
            return '/';
        },

        getCanonicalFileName(fileName: string): string {
            return fileName;
        },

        useCaseSensitiveFileNames(): boolean {
            return true;
        },

        getNewLine(): string {
            return '\n';
        },

        //#endregion CompilerHost
    };

    const program = ts.createProgram({
        host,
        rootNames: Object.keys(files),
        options: {},
    });

    const typeChecker = program.getTypeChecker();

    return { ctx, program, typeChecker };
}

function configureSimpleTestHost(filePath: string, programText: string) {
    const testHost = buildTestHost({ [filePath]: programText });

    const mockProjectService = buildMockProjectService(testHost.typeChecker);
    const sourceFile = testHost.program.getSourceFile(filePath);

    return {
        ...testHost,
        projectService: mockProjectService,
        sourceFile,
    };
}

describe('extractFeatureFlagsFromTs', () => {
    const fileName = 'impl.ts';
    const filePath = `/${fileName}`;
    const templateName = 'impl.html';
    const templatePath = `/${templateName}`;

    beforeEach(() => {
        (extractFeatureFlagsFromTemplate as jest.Mock).mockClear();
    });

    //#region Single Flag Read Variations

    it('should return no entries for empty program', () => {
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(filePath, '');
        const expectedFlagReads: FlagRead[] = [];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return no entries for element access with incorrect receiver type', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: Record<string, unknown> = {};
            const value = flags['${flagId}'];
            `
        );
        const expectedFlagReads: FlagRead[] = [];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with string literal', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            const value = flags['${flagId}'];
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 3, col: 27, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with no-sub template literal', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            const value = flags[\`${flagId}\`];
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 3, col: 27, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return no entries for element access with sub template literal', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            // Must be typed as 'string' to prevent the compiler from inlining
            // this and turning the key into a 'NoSubstitutionTemplateLiteral'.
            const x: string = '-abc';
            const value = flags[\`${flagId}\${x}\`];
            `
        );
        const expectedFlagReads: FlagRead[] = [];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with a literal-type identifier', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            const flagId = '${flagId}';
            const value = flags[flagId];
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 4, col: 27, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with a string-type identifier', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            const flagId: string = '${flagId}';
            const value = flags[flagId];
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 4, col: 27, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return no entries for element access with non-string identifier', () => {
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            const flagId = 0;
            const value = flags[flagId];
            `
        );
        const expectedFlagReads: FlagRead[] = [];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with a property read', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            const flags: LDFlagSet = {};
            const flagIds = { x: '${flagId}' };
            const value = flags[flagIds.x];
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 4, col: 27, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with a class property read', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            class Service {
                flagId = '${flagId}';
                method = (flags: LDFlagSet) => flags[this.flagId];
            }
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 4, col: 48, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access with a static property read', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            class Service {
                static FLAG_ID = '${flagId}';
                method = (flags: LDFlagSet) => flags[Service.FLAG_ID];
            }
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 4, col: 48, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for element access from a function call', () => {
        const flagId = Random.String();
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { LDFlagSet } from 'launchdarkly-js-client-sdk';
            function getFlags(): LDFlagSet {
                return {};
            }
            const value = getFlags()['${flagId}'];
            `
        );
        const expectedFlagReads: FlagRead[] = [
            { source: 'comp', filePath, row: 5, col: 27, flagId },
        ];

        const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(actual).toEqual(expectedFlagReads);
    });

    //#endregion Single Flag Read Variations

    //#region Process Inline Template

    it('should extract flags from a component class declaration with an inline template', () => {
        const template = '<p></p>';
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { Component } from '@angular/core';
            @Component({ selector: 'test', template: '${template}' })
            class TestComponent {}
            `
        );

        extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
            ctx,
            projectService,
            `file://${filePath}`,
            template,
            110
        );
    });

    it('should extract flags from a component class declaration with a quoted-key inline template', () => {
        const template = '<p></p>';
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { Component } from '@angular/core';
            @Component({ selector: 'test', 'template': '${template}' })
            class TestComponent {}
            `
        );

        extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
            ctx,
            projectService,
            `file://${filePath}`,
            template,
            112
        );
    });

    //#endregion Process Inline Template

    //#region Process External Template

    it('should extract flags from a component class declaration with an external template', () => {
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { Component } from '@angular/core';
            @Component({ selector: 'test', templateUrl: './${templateName}' })
            class TestComponent {}
            `
        );
        const template = `<p>${Random.String()}</p>`;
        (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
            if (path === templatePath) return template;
            throw new Error(`unexpected file read: ${path}`);
        });

        extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
            ctx,
            projectService,
            `file://${templatePath}`,
            template,
            0
        );
    });

    it('should extract flags from a component class declaration with a quoted-key external template', () => {
        const { ctx, projectService, sourceFile } = configureSimpleTestHost(
            filePath,
            `
            import { Component } from '@angular/core';
            @Component({ selector: 'test', 'templateUrl': './${templateName}' })
            class TestComponent {}
            `
        );
        const template = `<p>${Random.String()}</p>`;
        (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
            if (path === templatePath) return template;
            throw new Error(`unexpected file read: ${path}`);
        });

        extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
        expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
            ctx,
            projectService,
            `file://${templatePath}`,
            template,
            0
        );
    });

    //#endregion Process External Template
});
