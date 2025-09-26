import { BuilderContext, BuilderOutput, createBuilder } from '@angular-devkit/architect';
import { JsonObject } from '@angular-devkit/core';
import { FlagRead } from '@feature-flag-extractor/shared';
import { extractFeatureFlags } from '@feature-flag-extractor/ts-extractor';

interface Options extends JsonObject {
    projectRoot: string;
    tsConfig: string;
    verbose: boolean | null;
}

export default createBuilder(
    async (options: Options, context: BuilderContext): Promise<BuilderOutput> => {
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

        console.log('----------------------------------------------------------------------');

        // Run Angular parser
        const run = await context.scheduleBuilder(
            '@feature-flag-extractor/angular-extractor:extract-template-feature-flags',
            {}
        );

        const output: BuilderOutput | undefined = await run.output.toPromise();
        await run.stop();

        return { success: output?.success || false };
    }
);

// import { ExecutorContext, workspaceRoot } from '@nx/devkit';
// import { Architect } from '@angular-devkit/architect';
// import { WorkspaceNodeModulesArchitectHost } from '@angular-devkit/architect/node';
// import { json, logging, workspaces } from '@angular-devkit/core';
// import { NodeJsSyncHost } from '@angular-devkit/core/node';
//
// // export interface Options {}
//
// export default async function runExecutor(
//     options: json.JsonObject,
//     context: ExecutorContext
// ): Promise<{ success: boolean }> {
//     const logger = new logging.Logger('feature-flag-extractor');
//
//     logger.info(`Running template feature flag extractor for '${context.projectName}'`);
//
//     if (!context.projectName) {
//         console.error('Unable to determine project name');
//         return { success: false };
//     }
//
//     // Get root of the workspace
//     const root = workspaceRoot;
//
//     // Create a virtual workspace for Angular Architect
//     // This allows us to use Angular's builder system without an angular.json file
//     const virtualWorkspace = await createVirtualWorkspace(
//         root,
//         context.projectName,
//         context,
//         logger
//     );
//
//     // Create an Architect host using our virtual workspace
//     const workspaceHost = workspaces.createWorkspaceHost(new NodeJsSyncHost());
//     const architectHost = new WorkspaceNodeModulesArchitectHost(virtualWorkspace, root);
//     const architect = new Architect(architectHost);
//
//     console.log('HERE');
//     console.log(virtualWorkspace.extensions);
//
//     // Run the builder
//     const run = await architect.scheduleBuilder(
//         '@feature-flag-extractor/angular-extractor:extract-template-feature-flags',
//         {},
//         { logger }
//     );
//
//     logger.info(`Builder scheduled, waiting for completion...`);
//     const output = await run.output.toPromise();
//     console.log(`>>> OUTPUT: ${output}`);
//
//     await run.stop();
//
//     return { success: output?.success || false };
// }
//
// /**
//  * Creates a virtual Angular workspace that contains the project configuration
//  * from the NX workspace in a format that Angular Architect can understand
//  */
// async function createVirtualWorkspace(
//     workspaceRoot: string,
//     projectName: string,
//     context: ExecutorContext,
//     logger: logging.Logger
// ): Promise<workspaces.WorkspaceDefinition> {
//     logger.info(`Creating virtual workspace for project: ${projectName}`);
//
//     console.log(context.projectsConfigurations);
//
//     // Get project configuration from NX
//     const projectConfig = context.projectsConfigurations.projects[projectName];
//     if (!projectConfig) {
//         throw new Error(`Project '${projectName}' not found in NX workspace`);
//     }
//
//     // Build a minimal Angular workspace structure
//     const virtualWorkspace: workspaces.WorkspaceDefinition = {
//         extensions: {
//             cli: {},
//             newProjectRoot: '',
//             defaultProject: projectName,
//         },
//         projects: new workspaces.ProjectDefinitionCollection(),
//     };
//
//     // Add the target project configuration
//     virtualWorkspace.projects.set(projectName, {
//         root: workspaceRoot,
//         extensions: {
//             projectType: 'application',
//             root: projectConfig.root,
//             sourceRoot: projectConfig.sourceRoot,
//         },
//         targets: new workspaces.TargetDefinitionCollection(),
//     });
//
//     // Add the angular-extractor project configuration
//     virtualWorkspace.projects.set('@feature-flag-extractor/angular-extractor', {
//         root: `${workspaceRoot}/libs/angular-extractor`,
//         extensions: {
//             projectType: 'library',
//             root: 'libs/angular-extractor',
//             sourceRoot: 'libs/angular-extractor/src',
//         },
//         targets: new workspaces.TargetDefinitionCollection(),
//     });
//
//     // Add the extract-template-feature-flags target to the angular-extractor project
//     virtualWorkspace.projects
//         .get('@feature-flag-extractor/angular-extractor')
//         ?.targets.set('extract-template-feature-flags', {
//             builder: '@feature-flag-extractor/angular-extractor:extract-template-feature-flags',
//             options: {},
//             configurations: {},
//         });
//
//     // Add targets/architects
//     const projectTargets = projectConfig.targets || {};
//     for (const [targetName, targetConfig] of Object.entries(projectTargets)) {
//         if (targetConfig.executor) {
//             virtualWorkspace.projects.get(projectName)?.targets.set(targetName, {
//                 builder: targetConfig.executor ?? '',
//                 options: targetConfig.options || {},
//                 configurations: targetConfig.configurations || {},
//             });
//         }
//     }
//
//     logger.info(`Virtual workspace created successfully`);
//     return virtualWorkspace;
// }
