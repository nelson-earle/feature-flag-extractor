import * as ts from 'typescript';
import { LogLevel, Logger } from './logger';

/**
 * Copied from: https://github.com/angular/vscode-ng-language-service/blob/19.2.x/server/src/logger.ts
 */
export class TsLogger implements ts.server.Logger {
    private readonly logger: Logger;
    private readonly level: ts.server.LogLevel;

    private inGroup = false;
    private firstInGroup = true;

    constructor(logger: Logger, level = ts.server.LogLevel.terse) {
        this.logger = logger;
        this.level = level;
    }

    loggingEnabled(): boolean {
        return this.logger.hasLevel(LogLevel.DEBUG2);
    }

    getLogFileName(): string | undefined {
        return undefined;
    }

    hasLevel(level: ts.server.LogLevel): boolean {
        return this.loggingEnabled() && this.level >= level;
    }

    startGroup(): void {
        this.inGroup = true;
        this.firstInGroup = true;
        this.logger.startGroup();
    }

    endGroup(): void {
        this.inGroup = false;
        this.logger.endGroup();
    }

    close(): void {
        return;
    }

    perftrc(s: string): void {
        this.msg(s, ts.server.Msg.Perf);
    }

    info(s: string): void {
        this.msg(s, ts.server.Msg.Info);
    }

    msg(msg: string, type: ts.server.Msg = ts.server.Msg.Err): void {
        if (!this.loggingEnabled()) return;

        let message: string;
        if (!this.inGroup || this.firstInGroup) {
            this.firstInGroup = false;
            message = `(TS) ${type.padEnd(4)} ${msg}`;
        } else {
            message = msg;
        }

        this.logger.debug2(message);
    }
}
