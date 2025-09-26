import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { extractFeatureFlagsFromTs } from './typescript';
import { BuilderContext } from '@angular-devkit/architect';

export interface FlagRead {
    filePathRelative: string;
    row: number;
    col: number;
    flagId: string;
}

export function extractFeatureFlags(
    ctx: BuilderContext,
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
