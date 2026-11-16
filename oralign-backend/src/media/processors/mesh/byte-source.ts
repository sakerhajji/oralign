/**
 * A sliding read window over a file (or a whole in-memory Buffer), so one
 * PLY/OBJ parser serves both the full parse and the metadata-only scan of
 * files far past the parse cap. Refills are the only `await` points: the
 * parsers' inner loops stay synchronous and the event loop gets a turn
 * between chunks, instead of being blocked for the whole multi-GB scan.
 */
import { promises as fsp } from 'node:fs';

const WINDOW_BYTES = 4 * 1024 * 1024;

/** Longest line a text parser will buffer; real PLY/OBJ lines are < 200 B. */
export const MAX_LINE_BYTES = 1024 * 1024;

export class ByteSource {
  private constructor(
    /** Readable bytes are buf[pos, end). Re-read after every refill. */
    public buf: Buffer,
    public pos: number,
    public end: number,
    private file: fsp.FileHandle | null,
    private filePos: number,
  ) {}

  static fromBuffer(buf: Buffer): ByteSource {
    return new ByteSource(buf, 0, buf.length, null, 0);
  }

  /** `windowBytes` only shrinks in specs, to exercise refills on small files. */
  static async open(
    absPath: string,
    windowBytes = WINDOW_BYTES,
  ): Promise<ByteSource> {
    const file = await fsp.open(absPath, 'r');
    return new ByteSource(Buffer.allocUnsafe(windowBytes), 0, 0, file, 0);
  }

  get available(): number {
    return this.end - this.pos;
  }

  /**
   * Makes at least `n` bytes readable at `pos`, compacting (and if needed
   * growing) the window. False when the source ends first; whatever bytes
   * remain stay readable.
   */
  async ensure(n: number): Promise<boolean> {
    if (this.end - this.pos >= n) return true;
    if (this.file === null) return false;
    if (this.pos > 0) {
      this.buf.copyWithin(0, this.pos, this.end);
      this.end -= this.pos;
      this.pos = 0;
    }
    if (n > this.buf.length) {
      const grown = Buffer.allocUnsafe(Math.max(n, this.buf.length * 2));
      this.buf.copy(grown, 0, 0, this.end);
      this.buf = grown;
    }
    while (this.end < n) {
      const { bytesRead } = await this.file.read(
        this.buf,
        this.end,
        this.buf.length - this.end,
        this.filePos,
      );
      if (bytesRead === 0) {
        await this.close();
        return false;
      }
      this.end += bytesRead;
      this.filePos += bytesRead;
    }
    return true;
  }

  /** One more byte than currently readable — "give me the next chunk". */
  more(): Promise<boolean> {
    return this.ensure(this.available + 1);
  }

  async close(): Promise<void> {
    const file = this.file;
    this.file = null;
    await file?.close();
  }
}

/** Opens `absPath`, runs `read` over it and always releases the handle. */
export async function withFileSource<T>(
  absPath: string,
  read: (src: ByteSource) => Promise<T>,
): Promise<T> {
  const src = await ByteSource.open(absPath);
  try {
    return await read(src);
  } finally {
    await src.close();
  }
}

/**
 * Calls `onLine` with the [start, end) byte range of every line (newline
 * excluded, a trailing \r kept for the caller to ignore as whitespace).
 * Throws on a line longer than MAX_LINE_BYTES: such a file is not text.
 */
export async function forEachLine(
  src: ByteSource,
  onLine: (buf: Buffer, start: number, end: number) => void,
): Promise<void> {
  for (;;) {
    // Bounded view: bytes past `end` are stale data from an earlier fill.
    const view = src.buf.subarray(0, src.end);
    let nl: number;
    while ((nl = view.indexOf(0x0a, src.pos)) !== -1) {
      onLine(view, src.pos, nl);
      src.pos = nl + 1;
    }
    if (src.available > MAX_LINE_BYTES) {
      throw new Error('Line too long for a text mesh file');
    }
    if (!(await src.more())) {
      if (src.available > 0) onLine(src.buf, src.pos, src.end);
      src.pos = src.end;
      return;
    }
  }
}

/** Splits a latin1 line into whitespace-separated tokens. */
export function tokensOf(buf: Buffer, start: number, end: number): string[] {
  const text = buf.toString('latin1', start, end).trim();
  return text.length === 0 ? [] : text.split(/\s+/);
}
