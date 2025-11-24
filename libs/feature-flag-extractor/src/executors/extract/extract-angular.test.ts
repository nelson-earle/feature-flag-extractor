import { Context } from './models/context';
import { extractFeatureFlagsFromTemplate } from './extract-angular';
import { buildExecutorContext } from '../../test-utils';
import { Random } from 'random-test-values';
import { FlagRead } from './models/flag-read';
import { Logger } from './logger';
import { Options } from './schema';
import * as ts from 'typescript';
import { buildMockProjectService } from './testing/test-utils';

export function buildMockLogger(): jest.MockedObject<Logger> {
    return {
        hasLevel: jest.fn(),
        startGroup: jest.fn(),
        endGroup: jest.fn(),
        msg: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
        debug2: jest.fn(),
    } as Partial<Logger> as jest.MockedObject<Logger>;
}

export function buildContext(): Context {
    const logger = buildMockLogger();
    const options: Options = { tsConfig: '/tsconfig.json' };
    return { ...buildExecutorContext(), projectRoot: '/', logger, options };
}

export function buildMockTypeChecker(): jest.MockedObject<ts.TypeChecker> {
    return {
        typeToString: jest.fn().mockReturnValue('LDFlagSet'),
    } as Partial<ts.TypeChecker> as jest.MockedObject<ts.TypeChecker>;
}

describe('extractFeatureFlagsFromTemplate', () => {
    const ctx: Context = buildContext();
    const mockTypeChecker = buildMockTypeChecker();
    const mockProjectService = buildMockProjectService(mockTypeChecker);

    const templateName = 'impl.html';
    const templatePath = `/${templateName}`;
    const templateUrl = `file://${templatePath}`;

    function extract(template: string) {
        return extractFeatureFlagsFromTemplate(ctx, mockProjectService, templateUrl, template, 0);
    }

    it('should return no entries for empty template', () => {
        const template = ``;
        const expectedFlagReads: FlagRead[] = [];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for @switch', () => {
        const flagId = Random.String();
        const template = `@switch (flags['${flagId}']) {}`;
        const expectedFlagReads: FlagRead[] = [
            { source: 'tmpl', filePath: templatePath, row: 0, col: 9, flagId },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for @case', () => {
        const flagId = Random.String();
        const template = `@switch (x) { @case (flags['${flagId}']) {} }`;
        const expectedFlagReads: FlagRead[] = [
            { source: 'tmpl', filePath: templatePath, row: 0, col: 21, flagId },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return entries for @if branches', () => {
        const flagId1 = Random.String();
        const flagId2 = Random.String();
        const template = `
            @if (flags['${flagId1}']) {}
            @else if (flags['${flagId2}']) {}
            @else {}
        `;
        const expectedFlagReads: FlagRead[] = [
            {
                source: 'tmpl',
                filePath: templatePath,
                row: 0,
                col: 1 + 17,
                flagId: flagId1,
            },
            {
                source: 'tmpl',
                filePath: templatePath,
                row: 0,
                col: 1 + 17 + 7 + flagId1.length + 6 + 1 + 22,
                flagId: flagId2,
            },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for bound attribute', () => {
        const flagId = Random.String();
        const template = `<p [class]="flags['${flagId}']"></p>`;
        const expectedFlagReads: FlagRead[] = [
            { source: 'tmpl', filePath: templatePath, row: 0, col: 12, flagId },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for bound event', () => {
        const flagId = Random.String();
        const template = `<div (click)="onClick(flags['${flagId}'])"></div>`;
        const expectedFlagReads: FlagRead[] = [
            { source: 'tmpl', filePath: templatePath, row: 0, col: 22, flagId },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for bound text', () => {
        const flagId = Random.String();
        const template = `{{ flags['${flagId}'] }}`;
        const expectedFlagReads: FlagRead[] = [
            { source: 'tmpl', filePath: templatePath, row: 0, col: 3, flagId },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for @let', () => {
        const flagId = Random.String();
        const template = `@let x = flags['${flagId}'];`;
        const expectedFlagReads: FlagRead[] = [
            { source: 'tmpl', filePath: templatePath, row: 0, col: 9, flagId },
        ];

        const actual = extract(template);

        expect(actual).toEqual(expectedFlagReads);
    });
});
