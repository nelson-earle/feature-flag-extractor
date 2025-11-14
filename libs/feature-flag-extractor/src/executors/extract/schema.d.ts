export interface Options {
    tsConfig: string;
    logLevel?: OptionsLogLevel;
}

export type OptionsLogLevel = 'error' | 'warn' | 'info' | 'debug';
