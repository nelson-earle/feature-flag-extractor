import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { extractFeatureFlagsFromTs } from './ts';
import { ExecutorContext } from '@nx/devkit';
import { AngularTemplateTypeResolver } from './angular-template-type-resolver';

export interface FlagRead {
    kind: 'ts' | 'template';
    filePathRelative: string;
    row: number;
    col: number;
    flagId: string;
}

export function extractFeatureFlags(
    ctx: ExecutorContext,
    targetProjectPath: string,
    tsconfigPath: string
): FlagRead[] {
    // Check if required arguments are provided
    if (targetProjectPath) {
        targetProjectPath = path.resolve(targetProjectPath);
    } else {
        throw new Error('Please provide a path to the target project as the first argument');
    }

    // Check if project path exists
    if (!fs.existsSync(targetProjectPath)) {
        throw new Error(`Project path does not exist: ${targetProjectPath}`);
    }

    if (tsconfigPath) {
        // Resolve tsconfig path if provided
        tsconfigPath = path.resolve(tsconfigPath);

        // Check if tsconfig path exists
        if (!fs.existsSync(tsconfigPath)) {
            throw new Error(`TSConfig path does not exist: ${tsconfigPath}`);
        }
    }

    // Load the config
    const tsConfig = loadTsConfig(tsconfigPath);

    // Create the TypeScript program using the tsconfig
    const program = ts.createProgram({ rootNames: tsConfig.fileNames, options: tsConfig.options });

    const typeChecker = program.getTypeChecker();

    const ngTypeResolver = new AngularTemplateTypeResolver(ctx.root, tsconfigPath, tsConfig);

    // const templateFileName = 'apps/test-app/src/app/components/page/page.component.html';
    // // const position = /* beginning of `featureFlags | async` */ 355;
    // // const position = /* beginning of `flagsForTable` */ 355 - 16;
    // // const position = /* beginning of `@let` */ 355 - 16 - 5;
    // const position = 515;
    // ngTypeResolver.resolveType(templateFileName, position, position + 7);
    // return [];

    const flagReads: FlagRead[] = [];

    for (const sourceFile of program.getSourceFiles()) {
        if (
            !sourceFile.fileName.startsWith(targetProjectPath) ||
            sourceFile.fileName.includes('node_modules') ||
            sourceFile.fileName.endsWith('.d.ts') ||
            sourceFile.fileName.endsWith('.spec.ts') ||
            sourceFile.fileName.endsWith('.test.ts')
        ) {
            continue;
        }

        flagReads.push(
            ...extractFeatureFlagsFromTs(
                ctx,
                targetProjectPath,
                typeChecker,
                ngTypeResolver,
                sourceFile,
                sourceFile.fileName
            )
        );
    }

    return flagReads;
}

// Parse tsconfig.json
function loadTsConfig(configPath: string): ts.ParsedCommandLine {
    const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

    if (configFile.error) {
        throw new Error(`Error reading tsconfig: ${configFile.error.messageText}`);
    }

    // Parse the config, handling 'extends' recursively
    const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        path.dirname(configPath)
    );

    if (parsedConfig.errors.length > 0) {
        const errors = parsedConfig.errors.map(e => e.messageText).join('; ');
        throw new Error(`Error parsing tsconfig: [${errors}]`);
    }

    return parsedConfig;
}
