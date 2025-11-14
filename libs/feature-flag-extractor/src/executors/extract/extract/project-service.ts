import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
    GetTcbResponse,
    NgLanguageService,
    isNgLanguageService,
} from '@angular/language-service/api';
import { TsLogger } from './ts-logger';
import { Context } from '../context';
import { LogLevel, Logger } from '../logger';

const angularLanguageServicePluginFactory: ts.server.PluginModuleFactory = require('@angular/language-service');

export class ProjectService {
    private rootPath: string;
    private logger: Logger;

    private tsServerHost: ts.server.ServerHost;
    private tsLogger: TsLogger;
    private tsProjectService: ts.server.ProjectService;
    private tsLanguageServiceHost: ts.LanguageServiceHost;
    private tsLanguageService: ts.LanguageService;
    private ngLanguageService: NgLanguageService;

    private tcbCache = new Map<TcbKey, GetTcbResponse>();
    private tcbSourceMapCache = new Map<TcbKey, Record<string, ts.Node>>();

    constructor(ctx: Context, tsConfigPath: string, tsConfig: ts.ParsedCommandLine) {
        this.rootPath = ctx.root;
        this.logger = ctx.logger;

        if (!ts.sys.watchFile)
            throw new Error('typescript library does not support required method: watchFile');
        if (!ts.sys.watchDirectory)
            throw new Error('typescript library does not support required method: watchDirectory');
        if (!ts.sys.setTimeout)
            throw new Error('typescript library does not support required method: setTimeout');
        if (!ts.sys.clearTimeout)
            throw new Error('typescript library does not support required method: clearTimeout');

        this.tsServerHost = {
            ...ts.sys,
            watchFile: ts.sys.watchFile,
            watchDirectory: ts.sys.watchDirectory,
            setTimeout: ts.sys.setTimeout,
            clearTimeout: ts.sys.clearTimeout,
            setImmediate,
            clearImmediate,
        };

        this.tsLogger = new TsLogger(ctx.logger);

        this.tsProjectService = new ts.server.ProjectService({
            host: this.tsServerHost,
            logger: this.tsLogger,
            cancellationToken: ts.server.nullCancellationToken,
            useSingleInferredProject: true,
            useInferredProjectPerProjectRoot: true,
            typingsInstaller: ts.server.nullTypingsInstaller,
            // This may need to be set to `true`:
            // https://github.com/angular/vscode-ng-language-service/blob/19.2.x/server/src/session.ts#L123
            suppressDiagnosticEvents: false,
            session: undefined,
        });

        this.tsLanguageServiceHost = {
            getScriptFileNames: () => tsConfig.fileNames,
            getScriptVersion: () => '0',
            getScriptSnapshot: fileName => {
                if (!fs.existsSync(fileName)) {
                    return undefined;
                }
                return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'));
            },
            getCurrentDirectory: () => path.dirname(tsConfigPath),
            getCompilationSettings: () => tsConfig.options,
            getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
            readDirectory: ts.sys.readDirectory,
            directoryExists: ts.sys.directoryExists,
            getDirectories: ts.sys.getDirectories,
        };

        const fileName = tsConfig.fileNames[0];

        const openFileResult = this.tsProjectService.openClientFile(fileName);
        if (openFileResult.configFileErrors) {
            for (const d of openFileResult.configFileErrors) {
                this.logDiagnostic(d, LogLevel.DEBUG);
            }
        }
        if (!openFileResult.configFileName) {
            throw new Error(`No config file for ${fileName}`);
        }

        const tsProject = this.tsProjectService.findProject(openFileResult.configFileName);
        if (!tsProject) {
            throw new Error(`Unable to find TS project for file: ${fileName}`);
        }
        if (!tsProject.languageServiceEnabled) {
            throw new Error(
                `Language Service not enabled for project: ${tsProject.getProjectName()}`
            );
        }
        if (tsProject.isClosed()) {
            throw new Error(`Project is closed: ${tsProject.getProjectName()}`);
        }

        this.tsLanguageService = tsProject.getLanguageService();

        const angularLanguageServiceFactory = angularLanguageServicePluginFactory({
            typescript: ts,
        });

        // Create the Angular Language Service with only the expected parameters
        const ngLanguageService = angularLanguageServiceFactory.create({
            serverHost: this.tsServerHost,
            project: tsProject,
            languageServiceHost: this.tsLanguageServiceHost,
            languageService: this.tsLanguageService,
            config: {},
        });

        if (isNgLanguageService(ngLanguageService)) {
            this.ngLanguageService = ngLanguageService;
        } else {
            throw new Error(
                'Angular Language Service Factory returned a non-Angular language service'
            );
        }
    }

    getProgram(): ts.Program {
        const program = this.ngLanguageService.getProgram();
        if (!program) {
            throw new Error(`Failed to get the program of the NgLanguageService`);
        }
        return program;
    }

    getTypeChecker(): ts.TypeChecker {
        const program = this.getProgram();
        const typeChecker = program.getTypeChecker();
        return typeChecker;
    }

    // TODO: ignore `logLevel` if diagnostic category is `Error`
    private logDiagnostic = (d: ts.Diagnostic, logLevel: LogLevel | null = null): void => {
        if (typeof d.messageText === 'string') {
            this.logDiagnosticMessage(d.category, d.messageText, logLevel);
        } else {
            this.logDiagnosticMessageChain(d.messageText);
        }
    };

    private logDiagnosticMessage = (
        category: ts.DiagnosticCategory,
        message: string,
        logLevel: LogLevel | null = null
    ): void => {
        if (logLevel != null) {
            this.logger.msg(logLevel, message);
            return;
        }
        switch (category) {
            case ts.DiagnosticCategory.Error:
                this.logger.error(message);
                break;
            case ts.DiagnosticCategory.Warning:
                this.logger.warn(message);
                break;
            case ts.DiagnosticCategory.Message:
            case ts.DiagnosticCategory.Suggestion:
                this.logger.info(message);
                break;
        }
    };

    private logDiagnosticMessageChain = (
        chain: ts.DiagnosticMessageChain,
        logLevel: LogLevel | null = null,
        indent = ''
    ): void => {
        this.logDiagnosticMessage(chain.category, chain.messageText, logLevel);
        if (chain.next) {
            const nextIndent = '    ' + indent;
            for (const next of chain.next) {
                this.logDiagnosticMessageChain(next, logLevel, nextIndent);
            }
        }
    };

    private getTcb(key: TcbKey): GetTcbResponse {
        const cached = this.tcbCache.get(key);
        if (cached) return cached;

        const tcbResponse = this.ngLanguageService.getTcb(key.templatePath, key.position);

        if (!tcbResponse) {
            throw new Error(`TCB not found for template: ${key}`);
        }

        this.logger.debug(`TCB file: ${tcbResponse.fileName}`);
        this.logger.debug(`TCB selections: ${tcbResponse.selections.length}`);

        // this.logger.debug(tcbResponse.content);

        this.tcbCache.set(key, tcbResponse);
        return tcbResponse;
    }

    private getTcbSourceMap(key: TcbKey, tcbSourceFile: ts.SourceFile): Record<string, ts.Node> {
        const cached = this.tcbSourceMapCache.get(key);
        if (cached) return cached;

        const templateSourceMap: Record<string, ts.Node> = {};

        ts.forEachChild(tcbSourceFile, node =>
            parseTcbComments(tcbSourceFile, templateSourceMap, node)
        );

        this.tcbSourceMapCache.set(key, templateSourceMap);
        return templateSourceMap;
    }

    resolveTypeInTemplateAtPosition(
        templateFileName: string,
        position: number,
        positionEnd: number
    ): ts.Type {
        // Convert relative path to absolute if needed
        const absoluteTemplatePath = path.isAbsolute(templateFileName)
            ? templateFileName
            : path.resolve(this.rootPath, templateFileName);

        // Derive the component file path from the template path
        const absoluteComponentPath = absoluteTemplatePath.replace(/\.html$/, '.ts');
        if (!fs.existsSync(absoluteComponentPath)) {
            throw new Error(`not found: ${absoluteComponentPath}`);
        }

        // Open the component file so the language service knows about it
        const componentResult = this.tsProjectService.openClientFile(
            absoluteComponentPath,
            undefined, // fileContent - let it read from disk
            ts.ScriptKind.TS
        );
        if (componentResult.configFileErrors && componentResult.configFileErrors?.length > 0) {
            this.logger.startGroup();
            this.logger.warn(`file diagnostics: ${absoluteComponentPath}`);
            for (const d of componentResult.configFileErrors) {
                this.logDiagnostic(d, LogLevel.DEBUG);
            }
            this.logger.endGroup();
        }

        // if (this.logger.hasLevel(LogLevel.DEBUG)) {
        //     try {
        //         const content = fs.readFileSync(absoluteTemplatePath, 'utf8');
        //
        //         const beforePos = content.slice(0, position);
        //         const startOfLineAtPos = beforePos.match(/.*(\r\n|\n|\r)/s)?.[0].length ?? 0;
        //
        //         const afterPos = content.slice(position);
        //         const firstEolAfterPos = afterPos.match(/\r\n|\n|\r/)?.index;
        //         const endOfLineAtPos = firstEolAfterPos && position + firstEolAfterPos;
        //
        //         const lineAtPos = content.slice(startOfLineAtPos, endOfLineAtPos);
        //         const caretOffset = ' '.repeat(position - startOfLineAtPos);
        //         this.logger.debug(
        //             `resolve type of template expression:\n  │ ${lineAtPos}\n  │ ${caretOffset}^`
        //         );
        //     } catch (e) {
        //         throw new Error(`Failed to read file: ${absoluteTemplatePath}`, { cause: e });
        //     }
        // }

        // Use getTcb to get the Type Check Block and position mappings
        const tcbKey = TcbKey.intern(absoluteTemplatePath, position);
        const tcbResponse = this.getTcb(tcbKey);

        const program = this.getProgram();

        // Check if the language service knows about the TCB file
        const tcbSourceFile = program.getSourceFile(tcbResponse.fileName);

        if (!tcbSourceFile) {
            throw new Error(`TCB source file not found in program: ${tcbResponse.fileName}`);
        }

        const typeChecker = program.getTypeChecker();

        // For each selection (position in TCB that maps to our template position)
        for (const selection of tcbResponse.selections) {
            const nodeAtSelection = findNodeAtPosition(tcbSourceFile, selection.start);
            if (!nodeAtSelection) {
                throw new Error(
                    `unable to find node in TCB corresponding to position ${position} in template: ${templateFileName}`
                );
            }

            const nodeText = nodeAtSelection.getText(tcbSourceFile);
            this.logger.debug(
                `TCB node (${ts.SyntaxKind[nodeAtSelection.kind]}): \`\`\` ${nodeText} \`\`\``
            );

            const type = typeChecker.getTypeAtLocation(nodeAtSelection);
            this.logger.debug(`TCB type: ${typeChecker.typeToString(type)}`);
            return type;
        }

        this.logger.debug('no TCB selections, falling back to comment parsing...');

        const templateSourceMap = this.getTcbSourceMap(tcbKey, tcbSourceFile);

        const node = templateSourceMap[`${position},${positionEnd}`];
        if (node) {
            const type = typeChecker.getTypeAtLocation(node);
            this.logger.debug(`TCB node: ${node.getFullText()}`);
            this.logger.debug(`TCB type: ${typeChecker.typeToString(type)}`);
            return type;
        }

        throw new Error(
            `Unable to resolve type at position ${position} in template: ${absoluteTemplatePath}`
        );
    }
}

class TcbKey {
    private static internCache: Map<string, TcbKey> = new Map();

    static intern(templatePath: string, position: number): TcbKey {
        const internedKey = TcbKey.internCache.get(templatePath);
        if (internedKey) return internedKey;

        const key = new TcbKey(templatePath, position);
        TcbKey.internCache.set(templatePath, key);
        return key;
    }

    readonly templatePath: string;
    readonly position: number;

    private constructor(templatePath: string, position: number) {
        this.templatePath = templatePath;
        this.position = position;
    }

    toString(): string {
        return this.templatePath;
    }
}

/**
 * Find the smallest node at the given position.
 */
function findNodeAtPosition(node: ts.Node, pos: number): ts.Node | undefined {
    if (pos < node.pos || pos >= node.end) {
        return undefined;
    }
    const child = ts.forEachChild(node, child => findNodeAtPosition(child, pos));
    return child || node;
}

const TCB_SOURCE_MAP_COMMENT_RE = /^\/\*(\d+,\d+)\*\/$/;

function parseTcbComments(
    tcbSourceFile: ts.SourceFile,
    templateSourceMap: Record<string, ts.Node>,
    node: ts.Node
): void {
    const commentRanges = ts.getTrailingCommentRanges(tcbSourceFile.text, node.getEnd());
    if (commentRanges) {
        for (const commentRange of commentRanges) {
            const text = tcbSourceFile.text.substring(commentRange.pos, commentRange.end);
            const sourceMapComment = text.match(TCB_SOURCE_MAP_COMMENT_RE);
            if (sourceMapComment) {
                templateSourceMap[sourceMapComment[1]] = node;
            }
        }
    }
    ts.forEachChild(node, node => parseTcbComments(tcbSourceFile, templateSourceMap, node));
}
