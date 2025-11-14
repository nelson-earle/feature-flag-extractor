import type { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import type { Options } from './schema';
import { extractFeatureFlags, FlagRead } from './extract';
import { Logger, optionLogLevelToLogLevel } from './logger';
import { Context } from './context';
import { error, EXECUTOR_RESULT_SUCCESS } from './executor-util';
import * as path from 'node:path';

const extractFeatureFlagsExecutor: PromiseExecutor = async (
    options: Options,
    executorCtx: ExecutorContext
) => {
    const projectName = executorCtx.projectName;
    if (!projectName) {
        return error('Unable to get target project name');
    }

    const project = executorCtx.projectsConfigurations?.projects[projectName];
    if (!project) {
        return error(`Unable to get project: ${projectName}`);
    }

    if (!project?.root) {
        return error(`Unable to get root of project: ${projectName}`);
    }
    const projectRoot = path.resolve(project.root);

    const logLevel = optionLogLevelToLogLevel(options.logLevel);
    const logger = new Logger(logLevel);
    const ctx: Context = { ...executorCtx, projectRoot, logger, options };

    const flagReads: FlagRead[] = [];

    try {
        const tsFlagReads = extractFeatureFlags(ctx);
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
