import { OptionsLogLevel } from './schema';
import { DateTime } from 'luxon';

export const LogLevel = Object.freeze({
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
});

const LOG_LEVEL_LABEL = Object.freeze(['ERR ', 'WARN', 'INFO', 'DBG '] as const);

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export function optionLogLevelToLogLevel(logLevel?: OptionsLogLevel): LogLevel {
    switch (logLevel) {
        case 'error':
            return LogLevel.ERROR;
        case 'warn':
            return LogLevel.WARN;
        case 'info':
            return LogLevel.INFO;
        case 'debug':
            return LogLevel.DEBUG;
        default:
            return LogLevel.WARN;
    }
}

const CONSOLE_METHOD = Object.freeze({
    [LogLevel.ERROR]: 'error',
    [LogLevel.WARN]: 'warn',
    [LogLevel.INFO]: 'info',
    [LogLevel.DEBUG]: 'debug',
});

export class Logger {
    private readonly level: LogLevel;

    private seq = 0;
    private inGroup = false;
    private firstInGroup = true;

    constructor(level: LogLevel = LogLevel.DEBUG) {
        this.level = level;
    }

    hasLevel(level: LogLevel): boolean {
        return this.level >= level;
    }

    startGroup(): void {
        this.inGroup = true;
        this.firstInGroup = true;
    }

    endGroup(): void {
        this.inGroup = false;
        this.seq++;
    }

    msg(level: LogLevel, msg: string): void {
        if (!this.hasLevel(level)) return;

        let prefix = '';
        if (!this.inGroup || this.firstInGroup) {
            this.firstInGroup = false;
            const nowString = DateTime.now().toFormat('TT.SSS');
            prefix = `[${LOG_LEVEL_LABEL[level]}] ${this.seq.toString().padStart(5)} ${nowString}: `;
        }

        const consoleMethod = console[CONSOLE_METHOD[level]];

        for (const line of msg.split(EOL_RE)) {
            consoleMethod(`${prefix}${line}`);
        }

        if (!this.inGroup) this.seq++;
    }

    error(msg: string): void {
        this.msg(LogLevel.ERROR, msg);
    }

    warn(msg: string): void {
        this.msg(LogLevel.WARN, msg);
    }

    info(msg: string): void {
        this.msg(LogLevel.INFO, msg);
    }

    debug(msg: string): void {
        this.msg(LogLevel.DEBUG, msg);
    }
}

const EOL_RE = /\r\n|\n|\r/s;
