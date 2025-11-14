import * as ts from 'typescript';
import { DateTime } from 'luxon';

type ConsoleMethod = 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * Copied from: https://github.com/angular/vscode-ng-language-service/blob/19.2.x/server/src/logger.ts
 */
export class TsLogger implements ts.server.Logger {
    private readonly level;

    private seq = 0;
    private inGroup = false;
    private firstInGroup = true;

    constructor(level = ts.server.LogLevel.normal) {
        this.level = level;
    }

    loggingEnabled(): boolean {
        return true;
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
    }

    endGroup(): void {
        this.inGroup = false;
        this.seq++;
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

    msg(s: string, type: ts.server.Msg = ts.server.Msg.Err): void {
        if (!this.loggingEnabled()) return;
        // TODO: does this still log when the msg is outside the set log level?

        let consoleMethod: ConsoleMethod = 'error';
        switch (type) {
            case ts.server.Msg.Err:
                consoleMethod = 'error';
                break;
            case ts.server.Msg.Info:
                consoleMethod = 'info';
                break;
            case ts.server.Msg.Perf:
                consoleMethod = 'debug';
                break;
        }

        let message: string;
        if (!this.inGroup || this.firstInGroup) {
            this.firstInGroup = false;
            const nowString = DateTime.now().toFormat('TT.SSS');
            message = `${type} ${this.seq}`.padEnd(10) + `[${nowString}] ${s}\n`;
        } else {
            message = `${s}\n`;
        }

        // console[consoleMethod](message);

        if (!this.inGroup) this.seq++;
    }
}
