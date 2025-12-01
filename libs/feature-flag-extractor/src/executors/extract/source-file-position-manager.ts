import { Logger } from './logger';
import { Context } from './models/context';

interface SourceFileLine {
    offset: number;
    line: string;
}

export class SourceFilePositionManager {
    private logger: Logger;
    private filePath: string;
    private lines: SourceFileLine[] = [];

    constructor(ctx: Context, filePath: string, source: string) {
        this.logger = ctx.logger;
        this.filePath = filePath;

        let i: number;
        let c: string;
        let lineOffset = 0;

        for (i = 0; i < source.length; i++) {
            c = source[i];

            if (c === '\n' || i + 1 === source.length) {
                this.lines.push({ offset: lineOffset, line: source.substring(lineOffset, i) });
                lineOffset = i + 1;
            } else if (c === '\r' && source[i + 1] === '\n') {
                this.lines.push({ offset: lineOffset, line: source.substring(lineOffset, i) });
                lineOffset = i + 2;
                i++; // Skip over the `\n`
            }
        }
    }

    getLineAtOffset(offset: number): { line?: string; row: number; col: number } {
        for (let row = 0; row < this.lines.length; row++) {
            const line = this.lines[row];
            if (offset < line.offset + line.line.length) {
                return { line: line.line, row, col: offset - line.offset };
            }
        }

        this.logger.warn(
            `unable to get row and column of position in template: ${this.filePath} (position=${offset})`
        );
        return { row: 0, col: 0 };
    }
}
