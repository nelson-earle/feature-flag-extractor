import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { extractFeatureFlagsFromTs } from './ts';
import { ExecutorContext } from '@nx/devkit';
import { isNgLanguageService } from '@angular/language-service/api';
import { TsLogger } from './ts-logger';

const angularLanguageServicePluginFactory: ts.server.PluginModuleFactory = require('@angular/language-service');

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

    const logDiagnosticMessage = (category: ts.DiagnosticCategory, message: string) => {
        switch (category) {
            case ts.DiagnosticCategory.Error:
                console.error(message);
                break;
            case ts.DiagnosticCategory.Warning:
                console.warn(message);
                break;
            case ts.DiagnosticCategory.Message:
            case ts.DiagnosticCategory.Suggestion:
                console.info(message);
                break;
        }
    };

    const logDiagnosticMessageChain = (chain: ts.DiagnosticMessageChain, indent = '') => {
        logDiagnosticMessage(chain.category, chain.messageText);
        if (chain.next) {
            const nextIndent = '    ' + indent;
            for (const next of chain.next) {
                logDiagnosticMessageChain(next, nextIndent);
            }
        }
    };

    const logDiagnostic = (d: ts.Diagnostic) => {
        if (typeof d.messageText === 'string') {
            logDiagnosticMessage(d.category, d.messageText);
        } else {
            logDiagnosticMessageChain(d.messageText);
        }
    };

    if (!ts.sys.watchFile)
        throw new Error('typescript library does not support required method: watchFile');
    if (!ts.sys.watchDirectory)
        throw new Error('typescript library does not support required method: watchDirectory');
    if (!ts.sys.setTimeout)
        throw new Error('typescript library does not support required method: setTimeout');
    if (!ts.sys.clearTimeout)
        throw new Error('typescript library does not support required method: clearTimeout');

    const tsServerHost: ts.server.ServerHost = {
        ...ts.sys,
        watchFile: ts.sys.watchFile,
        watchDirectory: ts.sys.watchDirectory,
        setTimeout: ts.sys.setTimeout,
        clearTimeout: ts.sys.clearTimeout,
        setImmediate,
        clearImmediate,
    };

    const logger = new TsLogger(ts.server.LogLevel.terse);

    const tsProjectService = new ts.server.ProjectService({
        host: tsServerHost,
        logger,
        cancellationToken: ts.server.nullCancellationToken,
        useSingleInferredProject: true,
        useInferredProjectPerProjectRoot: true,
        typingsInstaller: ts.server.nullTypingsInstaller,
        // This may need to be set to `true`:
        // https://github.com/angular/vscode-ng-language-service/blob/19.2.x/server/src/session.ts#L123
        suppressDiagnosticEvents: false,
        session: undefined,
    });

    const tsLanguageServiceHost: ts.LanguageServiceHost = {
        getScriptFileNames: () => tsConfig.fileNames,
        getScriptVersion: () => '0',
        getScriptSnapshot: fileName => {
            if (!fs.existsSync(fileName)) {
                return undefined;
            }
            return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
        },
        getCurrentDirectory: () => path.dirname(tsconfigPath),
        getCompilationSettings: () => tsConfig.options,
        getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
    };

    // const tsLanguageService = ts.createLanguageService(
    //     tsLanguageServiceHost,
    //     ts.createDocumentRegistry()
    // );

    const fileName = path.resolve('apps/test-app/src/app/components/page/page.component.ts');

    // const scriptInfo = tsProjectService.getScriptInfo(fileName);
    // if (!scriptInfo) throw new Error(`Failed to get script info for file: ${fileName}`);
    //
    // let tsProject = tsProjectService.getDefaultProjectForFile(scriptInfo.fileName, false);
    //
    // if (!tsProject || tsProject.projectKind !== ts.server.ProjectKind.Configured) {
    //     console.info(`No project found, opening file ${scriptInfo.fileName}`);
    //     const openFileResult = tsProjectService.openClientFile(scriptInfo.fileName);
    //     openFileResult.configFileErrors?.forEach(logDiagnostic);
    //     if (!openFileResult.configFileName) {
    //         throw new Error(`No config file for ${scriptInfo.fileName}`);
    //     }
    //     tsProject = tsProjectService.findProject(openFileResult.configFileName);
    //     if (tsProject) {
    //         scriptInfo.detachAllProjects();
    //         scriptInfo.attachToProject(tsProject);
    //     }
    // }

    // WIP

    const openFileResult = tsProjectService.openClientFile(fileName);
    openFileResult.configFileErrors?.forEach(logDiagnostic);
    if (!openFileResult.configFileName) {
        throw new Error(`No config file for ${fileName}`);
    }
    const tsProject = tsProjectService.findProject(openFileResult.configFileName);

    if (!tsProject) throw new Error(`Unable to find TS project for file: ${fileName}`);
    if (!tsProject.languageServiceEnabled)
        throw new Error(`Language Service not enabled for project: ${tsProject.getProjectName()}`);
    if (tsProject.isClosed()) {
        throw new Error(`Project is closed: ${tsProject.getProjectName()}`);
    }

    const tsLanguageService = tsProject.getLanguageService();

    // const info = tsLanguageService.getQuickInfoAtPosition(fileName, 480 + 2);
    // console.info(`>>> QUICK INFO:`);
    // console.info(info ? JSON.stringify(info) : '[none]');

    const angularLanguageServiceFactory = angularLanguageServicePluginFactory({ typescript: ts });
    const angularLanguageService = angularLanguageServiceFactory.create({
        serverHost: tsServerHost,
        project: tsProject,
        languageServiceHost: tsLanguageServiceHost,
        languageService: tsLanguageService,
        config: {},
    });

    if (!isNgLanguageService(angularLanguageService))
        throw new Error('Angular Language Service Factory returned a non-Angular language service');

    const templateFileName = fileName.replace(/\.ts$/, '.html');
    const tcb = angularLanguageService.getTcb(templateFileName, 11);

    if (!tcb) {
        throw new Error(`Failed to get component TCB: ${templateFileName}`);
    } else {
        // console.info('TCB:');
        // console.info(tcb.content);
    }

    // console.info(`[BEGIN TCB]`);
    // console.info(tcb.content);
    // console.info(`[END TCB]`);

    const tcbFileName = `${templateFileName}.tcb.ts`;
    // const tcbScriptTarget = tsConfig.options.target ?? ts.ScriptTarget.Latest;
    // const tcbSourceFile = ts.createSourceFile(tcbFileName, tcb.content, tcbScriptTarget, true);

    // const templateContent = ts.sys.readFile(templateFileName);
    // if (!templateContent) throw new Error(`Failed to read template: ${templateFileName}`);

    const defaultHost = ts.createCompilerHost(tsConfig.options);

    const tcbHost: ts.CompilerHost = {
        ...defaultHost,

        // fileExists: (fileName: string): boolean => {
        //     if (fileName === tcbFileName) return true;
        //     return defaultHost.fileExists(fileName);
        // },

        // readFile: (fileName: string): string | undefined => {
        //     if (fileName === tcbFileName) return tcb.content;
        //     return defaultHost.readFile(fileName);
        // },

        getSourceFile: (
            fileName: string,
            languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
            onError?: (message: string) => void
            // shouldCreateNewSourceFile?: boolean,
        ): ts.SourceFile | undefined => {
            if (fileName === tcbFileName) {
                const sourceFile = ts.createSourceFile(
                    tcbFileName,
                    tcb.content,
                    languageVersionOrOptions,
                    true
                );
                return sourceFile;
            }
            try {
                const content = ts.sys.readFile(fileName, 'utf-8');
                if (!content) throw new Error(`readFile returned undefined: ${fileName}`);
                const sourceFile = ts.createSourceFile(
                    fileName,
                    content,
                    languageVersionOrOptions,
                    true
                );
                return sourceFile;
            } catch (err) {
                if (onError) {
                    const message = `Failed to get source file: ${err}`;
                    onError(message);
                }
            }
            return undefined;
        },
    };

    const tcbProgram = ts.createProgram({
        host: tcbHost,
        rootNames: [tcbFileName],
        options: tsConfig.options,
    });
    const tcbTypeChecker = tcbProgram.getTypeChecker();

    const templateExpressionSourceMap: {
        node: ts.Node;
        templateStart: number;
        templateEnd: number;
    }[] = [];

    const TCB_SOURCE_MAP_COMMENT_RE = /^\/\*(\d+),(\d+)\*\/$/;

    const parseNodeCommentRanges = (
        sourceFile: ts.SourceFile,
        node: ts.Node,
        nodeCommentRanges: ts.CommentRange[]
    ): void => {
        for (const commentRange of nodeCommentRanges) {
            const text = sourceFile.text.substring(commentRange.pos, commentRange.end);
            const sourceMapComment = text.match(TCB_SOURCE_MAP_COMMENT_RE);
            if (sourceMapComment) {
                const templateStart = parseInt(sourceMapComment[1]);
                const templateEnd = parseInt(sourceMapComment[2]);
                templateExpressionSourceMap.push({ node, templateStart, templateEnd });
            }
        }
    };

    for (const tcbSourceFile of tcbProgram.getSourceFiles()) {
        if (
            !tcbSourceFile.fileName.startsWith(targetProjectPath) ||
            tcbSourceFile.fileName.includes('node_modules') ||
            tcbSourceFile.fileName.endsWith('.d.ts') ||
            tcbSourceFile.fileName.endsWith('.spec.ts') ||
            tcbSourceFile.fileName.endsWith('.test.ts')
        ) {
            continue;
        }

        const visitTcb = (node: ts.Node): void => {
            const [start, end] = [node.getFullStart(), node.end];
            const leadingCommentRanges = ts.getLeadingCommentRanges(tcbSourceFile.text, start);
            if (leadingCommentRanges)
                parseNodeCommentRanges(tcbSourceFile, node, leadingCommentRanges);
            const trailingCommentRanges = ts.getTrailingCommentRanges(tcbSourceFile.text, end);
            if (trailingCommentRanges)
                parseNodeCommentRanges(tcbSourceFile, node, trailingCommentRanges);
            ts.forEachChild(node, visitTcb);
        };

        ts.forEachChild(tcbSourceFile, visitTcb);
    }

    for (const exprSourceMap of templateExpressionSourceMap) {
        if (exprSourceMap.templateStart === 6 && exprSourceMap.templateEnd === 13) {
            // const templateText = templateContent.substring(
            //     exprSourceMap.templateStart,
            //     exprSourceMap.templateEnd
            // );
            // const templateRange = `${exprSourceMap.templateStart},${exprSourceMap.templateEnd}`;
            const type = tcbTypeChecker.getTypeAtLocation(exprSourceMap.node);
            const typeString = tcbTypeChecker.typeToString(type);
            console.info(`[TEMPLATE EXPR] ${exprSourceMap.node.getFullText()} // ${typeString}`);
        }
    }

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
