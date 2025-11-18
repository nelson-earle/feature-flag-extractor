import '../../polyfills';

import type { PromiseExecutor, ExecutorContext } from '@nx/devkit';
import type { Options } from './schema';
import { extractFeatureFlags } from './extract';
import { FlagRead } from './models/flag-read';
import { Logger, optionLogLevelToLogLevel } from './logger';
import { Context } from './models/context';
import { ExecutorResult, error, EXECUTOR_RESULT_SUCCESS } from './executor-util';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { OutputStream } from './output';

const extractFeatureFlagsExecutor: PromiseExecutor = async (
    options: Options,
    executorCtx: ExecutorContext
) => {
    if (options.locations && options.json) {
        return error(`The following arguments are mutually exclusive: '--locations' & '--json'`);
    }

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

    const flagReadsById = Map.groupBy(flagReads, r => r.flagId);

    if (options.json) {
        return outputJson(options, flagReadsById);
    }

    return await outputHumanReadable(options, ctx.root, flagReadsById);
};

export default extractFeatureFlagsExecutor;

async function outputHumanReadable(
    options: Options,
    root: string,
    flagReadsById: Map<string, FlagRead[]>
): Promise<ExecutorResult> {
    const flagIds = Array.from(flagReadsById.keys()).sort();

    const stream = new OutputStream(options.output);

    try {
        for (const id of flagIds) {
            await stream.write(`${id}\n`);
            if (options.locations) {
                const readList = flagReadsById.get(id) ?? [];
                readList.sort(sortFlagReads);
                for (const read of readList) {
                    const filePath = path.relative(root, read.filePath);
                    const line = read.row + 1;
                    const char = read.col + 1;
                    await stream.write(`  ${filePath}:${line}:${char} [${read.kind}]\n`);
                }
            }
        }
    } catch (ex) {
        const message = options.output
            ? `Failed to write to file: ${options.output}`
            : `Failed to write to stdout`;
        return error(`${message}\n\n${ex}`);
    }

    await stream.finish();

    return EXECUTOR_RESULT_SUCCESS;
}

function sortFlagReads(a: FlagRead, b: FlagRead): number {
    const byPath = a.filePath.localeCompare(b.filePath);
    if (byPath !== 0) return byPath;
    const byRow = a.row - b.row; // ascending
    if (byRow !== 0) return byRow;
    const byCol = a.col - b.col; // ascending
    if (byCol !== 0) return byCol;
    return 0;
}

function outputJson(options: Options, flagReadsById: Map<string, FlagRead[]>): ExecutorResult {
    interface OutputEntry {
        path: string;
        line: number;
        column: number;
    }
    const output: Record<string, OutputEntry[]> = {};

    for (const [id, readList] of flagReadsById.entries()) {
        output[id] = readList.map(r => ({
            path: r.filePath,
            line: r.row + 1,
            column: r.col + 1,
        }));
    }

    const dest: fs.PathOrFileDescriptor = options.output ?? process.stdout.fd;
    const isDestStdout = dest === process.stdout.fd;

    const data = JSON.stringify(output, undefined, isDestStdout ? 2 : 0);

    try {
        fs.writeFileSync(dest, data);
    } catch (ex) {
        const message = isDestStdout
            ? `Failed to write JSON to stdout`
            : `Failed to write JSON to file: ${dest}`;
        return error(`${message}\n\n${ex}`);
    }

    return EXECUTOR_RESULT_SUCCESS;
}
