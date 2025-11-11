export interface Options {
    projectRoot: string;
    tsConfig: string;
    logLevel?: OptionsLogLevel;
}

export type OptionsLogLevel = 'error' | 'warn' | 'info' | 'debug';
