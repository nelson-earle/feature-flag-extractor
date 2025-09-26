import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';
import { extractFeatureFlags, FlagRead } from './extract';

interface Options extends JsonObject {
    projectRoot: string;
    tsConfig: string;
    verbose: boolean | null;
}

export default createBuilder(
    async (options: Options, _context: BuilderContext): Promise<BuilderOutput> => {
        const flagReads: FlagRead[] = [];

        try {
            const tsFlagReads = extractFeatureFlags(options.projectRoot, options.tsConfig);
            flagReads.push(...tsFlagReads);
        } catch (ex) {
            const error = ex instanceof Error ? ex.message : 'An unknown error occurred';
            return { success: false, error };
        }

        for (const read of flagReads) {
            const line = read.row + 1;
            const char = read.col + 1;
            console.log(`${read.filePathRelative}:${line}:${char} | ${read.flagId}`);
        }

        return { success: true };
    }
);
