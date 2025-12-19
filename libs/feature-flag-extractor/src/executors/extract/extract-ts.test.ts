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

    describe('Element Access Flag Read', () => {
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
                {
                    source: 'comp',
                    filePath,
                    row: 3,
                    colStart: 36,
                    colEnd: 36 + flagId.length + 2,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 3,
                    colStart: 36,
                    colEnd: 36 + flagId.length + 2,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 4,
                    colStart: 36,
                    colEnd: 36 + 6,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 4,
                    colStart: 36,
                    colEnd: 36 + 6,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 4,
                    colStart: 36,
                    colEnd: 36 + 9,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 4,
                    colStart: 57,
                    colEnd: 57 + 11,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 4,
                    colStart: 57,
                    colEnd: 57 + 15,
                    flagId,
                },
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
                {
                    source: 'comp',
                    filePath,
                    row: 5,
                    colStart: 41,
                    colEnd: 41 + flagId.length + 2,
                    flagId,
                },
            ];

            const actual = extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

            expect(actual).toEqual(expectedFlagReads);
        });
    });

    describe('Process Inline Template', () => {
        const template = '<p></p>';

        [
            { literal: `'${template}'`, process: true },
            { literal: `\`${template}\``, process: true },
            { literal: `\`\${x}${template}\``, process: false },
        ].forEach(({ literal, process }) => {
            it(`should process the literal component template | ${literal}`, () => {
                const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                    filePath,
                    `
                    import { Component } from '@angular/core';
                    const x: string = '';
                    @Component({ selector: 'test', template: ${literal} })
                    class TestComponent {}
                    `
                );

                extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

                if (process) {
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
                        ctx,
                        projectService,
                        {
                            kind: 'inline',
                            path: filePath,
                            content: template,
                            offset: 168,
                        }
                    );
                } else {
                    expect(extractFeatureFlagsFromTemplate).not.toHaveBeenCalled();
                }
            });
        });

        it('should process the quoted-key literal component template', () => {
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
            expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(ctx, projectService, {
                kind: 'inline',
                path: filePath,
                content: template,
                offset: 120,
            });
        });

        [
            { decl: `const TMPL = '${template}'`, offset: 14, process: true },
            { decl: `const TMPL = \`${template}\``, offset: 14, process: true },
            { decl: `const TMPL = \`\${x}${template}\``, offset: 14, process: false },
            { decl: `const TMPL: string = '${template}'`, offset: 22, process: true },
            { decl: `const TMPL: string = \`${template}\``, offset: 22, process: true },
            { decl: `const TMPL: string = \`\${x}${template}\``, offset: 22, process: false },
        ].forEach(({ decl, offset, process }) => {
            it(`should process the string identifier component template | ${decl}`, () => {
                const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                    filePath,
                    `
                    import { Component } from '@angular/core';
                    const x: string = '';
                    ${decl};
                    @Component({ selector: 'test', template: TMPL })
                    class TestComponent {}
                    `
                );

                extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

                if (process) {
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
                        ctx,
                        projectService,
                        {
                            kind: 'inline',
                            path: filePath,
                            content: template,
                            offset: /* offset of `decl` */ 126 + offset,
                        }
                    );
                } else {
                    expect(extractFeatureFlagsFromTemplate).not.toHaveBeenCalled();
                }
            });
        });

        [
            { decl: `const template = '${template}'`, offset: 18, process: true },
            { decl: `const template = \`${template}\``, offset: 18, process: true },
            { decl: `const template = \`\${x}${template}\``, offset: 18, process: false },
            { decl: `const template: string = '${template}'`, offset: 26, process: true },
            { decl: `const template: string = \`${template}\``, offset: 26, process: true },
            { decl: `const template: string = \`\${x}${template}\``, offset: 26, process: false },
        ].forEach(({ decl, offset, process }) => {
            it(`should process the shorthand string identifier component template | ${decl}`, () => {
                const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                    filePath,
                    `
                    import { Component } from '@angular/core';
                    const x: string = '';
                    ${decl};
                    @Component({ selector: 'test', template })
                    class TestComponent {}
                    `
                );

                extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

                if (process) {
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
                        ctx,
                        projectService,
                        {
                            kind: 'inline',
                            path: filePath,
                            content: template,
                            offset: /* offset of `decl` */ 126 + offset,
                        }
                    );
                } else {
                    expect(extractFeatureFlagsFromTemplate).not.toHaveBeenCalled();
                }
            });
        });
    });

    describe('Process External Template', () => {
        let template = '';

        beforeEach(() => {
            (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
                if (path === templatePath) return template;
                throw new Error(`unexpected file read: ${path}`);
            });
        });

        [
            { literalUrl: `'${templateName}'`, process: true },
            { literalUrl: `\`${templateName}\``, process: true },
            { literalUrl: `\`\${x}${templateName}\``, process: false },
        ].forEach(({ literalUrl, process }) => {
            it(`should process the component template URL | ${literalUrl}`, () => {
                const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                    filePath,
                    `
                    import { Component } from '@angular/core';
                    const x: string = '';
                    @Component({ selector: 'test', templateUrl: ${literalUrl} })
                    class TestComponent {}
                    `
                );
                template = `<p>${Random.String()}</p>`;

                extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

                if (process) {
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
                        ctx,
                        projectService,
                        {
                            kind: 'external',
                            path: templatePath,
                            content: template,
                            offset: 0,
                        }
                    );
                } else {
                    expect(extractFeatureFlagsFromTemplate).not.toHaveBeenCalled();
                }
            });
        });

        it('should process the quoted-key template URL', () => {
            const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                filePath,
                `
                import { Component } from '@angular/core';
                @Component({ selector: 'test', 'templateUrl': './${templateName}' })
                class TestComponent {}
                `
            );
            template = `<p>${Random.String()}</p>`;

            extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

            expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
            expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(ctx, projectService, {
                kind: 'external',
                path: templatePath,
                content: template,
                offset: 0,
            });
        });

        [
            { decl: `const URL = '${templateName}'`, offset: 13, process: true },
            { decl: `const URL = \`${templateName}\``, offset: 13, process: true },
            { decl: `const URL = \`\${x}${templateName}\``, offset: 13, process: false },
            { decl: `const URL: string = '${templateName}'`, offset: 21, process: true },
            { decl: `const URL: string = \`${templateName}\``, offset: 21, process: true },
            { decl: `const URL: string = \`\${x}${templateName}\``, offset: 21, process: false },
        ].forEach(({ decl, process }) => {
            it(`should process the component template URL | ${decl}`, () => {
                const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                    filePath,
                    `
                    import { Component } from '@angular/core';
                    const x: string = '';
                    ${decl};
                    @Component({ selector: 'test', templateUrl: URL })
                    class TestComponent {}
                    `
                );
                template = `<p>${Random.String()}</p>`;

                extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

                if (process) {
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
                        ctx,
                        projectService,
                        {
                            kind: 'external',
                            path: templatePath,
                            content: template,
                            offset: 0,
                        }
                    );
                } else {
                    expect(extractFeatureFlagsFromTemplate).not.toHaveBeenCalled();
                }
            });
        });

        [
            { decl: `const templateUrl = '${templateName}'`, offset: 21, process: true },
            { decl: `const templateUrl = \`${templateName}\``, offset: 21, process: true },
            { decl: `const templateUrl = \`\${x}${templateName}\``, offset: 21, process: false },
            { decl: `const templateUrl: string = '${templateName}'`, offset: 29, process: true },
            { decl: `const templateUrl: string = \`${templateName}\``, offset: 29, process: true },
            {
                decl: `const templateUrl: string = \`\${x}${templateName}\``,
                offset: 29,
                process: false,
            },
        ].forEach(({ decl, process }) => {
            it(`should process the component template URL | ${decl}`, () => {
                const { ctx, projectService, sourceFile } = configureSimpleTestHost(
                    filePath,
                    `
                    import { Component } from '@angular/core';
                    const x: string = '';
                    ${decl};
                    @Component({ selector: 'test', templateUrl })
                    class TestComponent {}
                    `
                );
                template = `<p>${Random.String()}</p>`;

                extractFeatureFlagsFromTs(ctx, projectService, sourceFile);

                if (process) {
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledTimes(1);
                    expect(extractFeatureFlagsFromTemplate).toHaveBeenCalledWith(
                        ctx,
                        projectService,
                        {
                            kind: 'external',
                            path: templatePath,
                            content: template,
                            offset: 0,
                        }
                    );
                } else {
                    expect(extractFeatureFlagsFromTemplate).not.toHaveBeenCalled();
                }
            });
        });
    });
});
