import type { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import type { Options } from './schema';
import { extractFeatureFlags, FlagRead } from './extract';
import { Logger, optionLogLevelToLogLevel } from './logger';
import { Context } from './context';
import { error, EXECUTOR_RESULT_SUCCESS } from './executor-util';

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
        const message = ex instanceof Error ? ex.message : 'An unknown error occurred';
        return error(message);
    }

    for (const read of flagReads) {
        const line = read.row + 1;
        const char = read.col + 1;
        console.log(`${read.filePathRelative}:${line}:${char} [${read.kind}] | ${read.flagId}`);
    }

    console.log(flagReads.length);

    const expectedFlags = 18;
    if (flagReads.length !== expectedFlags) {
        return error(`expected ${expectedFlags} flags, found ${flagReads.length}`);
    }

    return EXECUTOR_RESULT_SUCCESS;
};

export default extractFeatureFlagsExecutor;
