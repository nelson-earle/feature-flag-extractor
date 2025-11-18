export interface Options {
    tsConfig: string;
    logLevel?: OptionsLogLevel;
    locations?: boolean;
    output?: string;
    json?: boolean;
}

export type OptionsLogLevel = 'error' | 'warn' | 'info' | 'debug' | 'debug2';
