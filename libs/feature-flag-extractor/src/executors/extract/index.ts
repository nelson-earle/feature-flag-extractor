import type { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import type { Options } from './schema';
import { extractFeatureFlags, FlagRead } from './extract';
import { Logger, optionLogLevelToLogLevel } from './logger';
import { Context } from './context';

const extractFeatureFlagsExecutor: PromiseExecutor = async (
    options: Options,
    executorCtx: ExecutorContext
) => {
    const logLevel = optionLogLevelToLogLevel(options.logLevel);
    const logger = new Logger(logLevel);
    const ctx: Context = { ...executorCtx, logger };

    const flagReads: FlagRead[] = [];

    try {
        const tsFlagReads = extractFeatureFlags(ctx, options.projectRoot, options.tsConfig);
        flagReads.push(...tsFlagReads);
    } catch (ex) {
        const error = ex instanceof Error ? ex.message : 'An unknown error occurred';
        console.error(error);
        return { success: false };
    }

    for (const read of flagReads) {
        const line = read.row + 1;
        const char = read.col + 1;
        console.log(`${read.filePathRelative}:${line}:${char} [${read.kind}] | ${read.flagId}`);
    }

    console.log(flagReads.length);
    console.assert(flagReads.length === 18, `unexpected number of flags ${flagReads.length}`);

    return { success: true };
};

export default extractFeatureFlagsExecutor;
