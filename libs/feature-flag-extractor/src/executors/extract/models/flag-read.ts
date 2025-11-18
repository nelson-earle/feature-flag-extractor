export interface FlagRead {
    kind: 'ts' | 'template';
    filePath: string;
    row: number;
    col: number;
    flagId: string;
}
