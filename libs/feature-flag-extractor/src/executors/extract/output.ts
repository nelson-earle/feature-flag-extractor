import * as fs from 'node:fs';
import { Writable } from 'node:stream';
import { once } from 'node:events';

class StdoutStream extends Writable {
    override _write(
        chunk: string,
        encoding: BufferEncoding,
        callback: (error?: Error | null) => void
    ): void {
        process.stdout.write(chunk, encoding, callback);
    }
}

class FileStream extends Writable {
    private fileStream: fs.WriteStream;

    constructor(path: string) {
        super();
        this.fileStream = fs.createWriteStream(path);
    }

    override _write(
        chunk: string,
        encoding: BufferEncoding,
        callback: (error?: Error | null) => void
    ): void {
        this.fileStream.write(chunk, encoding, callback);
    }

    override _final(callback: (error?: Error | null) => void): void {
        this.fileStream.end(callback);
    }

    override _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        this.fileStream.destroy();
        callback(error);
    }
}

export class OutputStream {
    private stream: StdoutStream | FileStream;

    constructor(path?: string) {
        this.stream = path ? new FileStream(path) : new StdoutStream();
    }

    write(data: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const belowHighWaterMark = this.stream.write(data, error => {
                if (error) reject(error);
            });
            if (!belowHighWaterMark) {
                once(this.stream, 'drain').then(() => resolve(), reject);
            }
            resolve();
        });
    }

    async finish(): Promise<void> {
        this.stream.end();
        await once(this.stream, 'finish');
    }
}
