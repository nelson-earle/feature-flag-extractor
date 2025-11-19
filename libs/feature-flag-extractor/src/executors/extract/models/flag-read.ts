import { OptionsFilterSource } from '../schema';

export type FlagReadSource = 'comp' | 'tmpl';

export interface FlagRead {
    source: FlagReadSource;
    filePath: string;
    row: number;
    col: number;
    flagId: string;
}

export function optionsSourceToFlagReadSource(source?: OptionsFilterSource): FlagReadSource | null {
    switch (source) {
        case 'component':
            return 'comp';
        case 'template':
            return 'tmpl';
        default:
            return null;
    }
}
