export interface Options {
    tsConfig: string;
    logLevel?: OptionsLogLevel;
    locations?: boolean;
    output?: string;
    json?: boolean;
    filterFiles?: string;
    filterFlags?: string;
    filterSource?: OptionsFilterSource;
}

export type OptionsLogLevel = 'error' | 'warn' | 'info' | 'debug' | 'debug2';

export type OptionsFilterSource = 'component' | 'template';
