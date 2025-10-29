import * as ts from 'typescript';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { isNgLanguageService, NgLanguageService } from '@angular/language-service/api';
import { TsLogger } from './ts-logger';

const angularLanguageServicePluginFactory: ts.server.PluginModuleFactory = require('@angular/language-service');

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

export class AngularTemplateTypeResolver {
    private tsServerHost: ts.server.ServerHost;
    private tsLogger: TsLogger;
    private tsProjectService: ts.server.ProjectService;
    private tsLanguageServiceHost: ts.LanguageServiceHost;
    private tsLanguageService: ts.LanguageService;
    private ngLanguageService: NgLanguageService;

    constructor(tsConfigPath: string, tsConfig: ts.ParsedCommandLine) {
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

        this.tsLogger = new TsLogger(ts.server.LogLevel.terse);

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
            openFileResult.configFileErrors.forEach(logDiagnostic);
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

    resolveType(templateFileName: string, position: number): void {
        const definitions = this.ngLanguageService.getDefinitionAtPosition(
            templateFileName,
            position
        );
        if (!definitions) {
            console.info(`[NO DEFS FOUND FROM TEMPLATE]`);
            return;
        }

        console.info(`[DEFS FROM TEMPLATE]: ${templateFileName}`);
        for (const def of definitions) {
            console.info(
                `-- def: ${def.fileName}:${def.textSpan.start}-${def.textSpan.start + def.textSpan.length}`
            );
            const defSourceFile = this.program.getSourceFile(def.fileName);
            if (!defSourceFile) {
                console.warn(`Failed to find source file for template definition: ${def.fileName}`);
                continue;
            }
            const visitDefSource = (node: ts.Node): ts.Node | null => {
                if (node.pos <= def.textSpan.start && def.textSpan.start < node.end) {
                    return ts.forEachChild(node, visitDefSource) || node;
                }
                return null;
            };
            const defNode = ts.forEachChild(defSourceFile, visitDefSource);
            if (!defNode) {
                console.warn(
                    `Failed to find node in source file that contains definition: ${def.fileName}`
                );
                continue;
            }
            const defType = this.typeChecker.getTypeAtLocation(defNode);
            const defTypeString = this.typeChecker.typeToString(defType);
            console.info(`${defNode.getText()} // ${defTypeString}`);
        }
    }
}
