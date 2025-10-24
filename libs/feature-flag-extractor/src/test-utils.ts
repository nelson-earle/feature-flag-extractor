import { ExecutorContext } from '@nx/devkit';
import process from 'node:process';

export function buildExecutorContext(): ExecutorContext {
    return {
        root: '/',
        cwd: process.cwd(),
        isVerbose: false,
        projectGraph: {
            dependencies: {},
            nodes: {},
        },
        projectsConfigurations: {
            projects: {},
            version: 2,
        },
        nxJsonConfiguration: {},
    };
}
