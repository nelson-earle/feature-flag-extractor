import { ExecutorContext } from '@nx/devkit';
import { extractFeatureFlagsFromTemplate } from './angular';
import { buildExecutorContext } from '../../../test-utils';
import { Random } from 'random-test-values';
import { FlagRead } from '.';

describe('extractFeatureFlagsFromTemplate', () => {
    let ctx: ExecutorContext;

    const templateName = 'impl.html';
    const templatePath = `/${templateName}`;
    const templateUrl = `file://${templatePath}`;

    beforeEach(() => {
        ctx = buildExecutorContext();
    });

    it('should return no entries for empty template', () => {
        const template = ``;
        const expectedFlagReads: FlagRead[] = [];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for @switch', () => {
        const flagId = Random.String();
        const template = `@switch (flags['${flagId}']) {}`;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: 9,
                col: 9 + 7 + flagId.length + 2,
                flagId,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for @case', () => {
        const flagId = Random.String();
        const template = `@switch (x) { @case (flags['${flagId}']) {} }`;
        const expectedStart = 21;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart,
                col: expectedStart + 7 + flagId.length + 2,
                flagId,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return entries for @if branches', () => {
        const flagId1 = Random.String();
        const flagId2 = Random.String();
        const expectedStart = 18;
        const template = `
            @if (flags['${flagId1}']) {}
            @else if (flags['${flagId2}']) {}
            @else {}
        `;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart,
                col: expectedStart + 7 + flagId1.length + 2,
                flagId: flagId1,
            },
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart + 7 + flagId1.length + 2 + 27,
                col: expectedStart + 7 + flagId1.length + 2 + 27 + 7 + flagId2.length + 2,
                flagId: flagId2,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for bound attribute', () => {
        const flagId = Random.String();
        const template = `<p [class]="flags['${flagId}']"></p>`;
        const expectedStart = 12;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart,
                col: expectedStart + 7 + flagId.length + 2,
                flagId,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for bound event', () => {
        const flagId = Random.String();
        const template = `<div (click)="onClick(flags['${flagId}'])"></div>`;
        const expectedStart = 22;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart,
                col: expectedStart + 7 + flagId.length + 2,
                flagId,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for bound text', () => {
        const flagId = Random.String();
        const template = `{{ flags['${flagId}'] }}`;
        const expectedStart = 3;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart,
                col: expectedStart + 7 + flagId.length + 2,
                flagId,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });

    it('should return an entry for @let', () => {
        const flagId = Random.String();
        const template = `@let x = flags['${flagId}'];`;
        const expectedStart = 9;
        const expectedFlagReads: FlagRead[] = [
            {
                kind: 'template',
                filePathRelative: templateName,
                row: expectedStart,
                col: expectedStart + 7 + flagId.length + 2,
                flagId,
            },
        ];

        const actual = extractFeatureFlagsFromTemplate(ctx, '/', templateUrl, template);

        expect(actual).toEqual(expectedFlagReads);
    });
});
