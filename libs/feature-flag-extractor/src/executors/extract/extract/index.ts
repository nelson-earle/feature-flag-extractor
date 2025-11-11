import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { extractFeatureFlagsFromTs } from './ts';
import { Context } from '../context';
import { ProjectService } from './project-service';

export interface FlagRead {
    kind: 'ts' | 'template';
    filePathRelative: string;
    row: number;
    col: number;
    flagId: string;
}

export function extractFeatureFlags(
    ctx: Context,
    targetProjectPath: string,
    tsConfigPath: string
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

    if (tsConfigPath) {
        // Resolve tsconfig path if provided
        tsConfigPath = path.resolve(tsConfigPath);

        // Check if tsconfig path exists
        if (!fs.existsSync(tsConfigPath)) {
            throw new Error(`TSConfig path does not exist: ${tsConfigPath}`);
        }
    }

    // Load the config
    const tsConfig = loadTsConfig(tsConfigPath);

    const projectService = new ProjectService(ctx, tsConfigPath, tsConfig);

    const program = projectService.getProgram();

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
                projectService,
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
