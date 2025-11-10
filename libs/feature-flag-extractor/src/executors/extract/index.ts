import type { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import type { Options } from './schema';
import { extractFeatureFlags, FlagRead } from './extract';

const extractFeatureFlagsExecutor: PromiseExecutor = async (
    options: Options,
    ctx: ExecutorContext
) => {
    const flagReads: FlagRead[] = [];

    try {
        const tsFlagReads = extractFeatureFlags(ctx, options.projectRoot, options.tsConfig);
        flagReads.push(...tsFlagReads);
    } catch (ex) {
        const error = ex instanceof Error ? ex.message : 'An unknown error occurred';
        console.error(error);
        return { success: false };
    }

    console.log();
    console.log('======================================================================');

    for (const read of flagReads) {
        const line = read.row + 1;
        const char = read.col + 1;
        console.log(`${read.filePathRelative}:${line}:${char} [${read.kind}] | ${read.flagId}`);
    }

    console.log(flagReads.length);

    return { success: true };
};

export default extractFeatureFlagsExecutor;
