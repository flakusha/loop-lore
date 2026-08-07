/**
 * FileTransport — canonical JSONL output to a rotating log file.
 *
 * Writes one JSON object per line (via formatJSONL) to the configured path.
 * When the active file exceeds jsonlMaxBytes, it is rotated: the active file
 * becomes `path.1`, previous rotations shift to `path.2 … path.N`, and old
 * files beyond jsonlMaxFiles are removed. A fresh active file is started.
 *
 * Catches all write/rotation errors silently — logging must never crash the
 * app (Transport contract).
 *
 * @module logger-transports-file
 */

import { appendFile, mkdir, rename, rm, stat, } from "node:fs/promises";
import { dirname, } from "node:path";
import { formatJSONL, } from "../formatters";
import type { LogEntry, Transport, } from "../types";

export interface FileTransportOptions {
  /** Log file path (active file). */
  path: string;
  /** Max active-file bytes before rotation. Default 100 MB. */
  maxBytes?: number;
  /** Max rotated files to keep (excluding active). Default 5. */
  maxFiles?: number;
}

/** Extensionless `path.1`/`path.2` rotation scheme aligned with jsonlMaxFiles. */
export class FileTransport implements Transport {
  readonly name = "file";

  private readonly activePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(options: FileTransportOptions,) {
    this.activePath = options.path;
    this.maxBytes = options.maxBytes ?? 100 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;
  }

  async write(entry: LogEntry,): Promise<void> {
    try {
      const line = formatJSONL(entry,);
      await mkdir(dirname(this.activePath,), { recursive: true, },);

      const currentSize = await this.fileSize(this.activePath,);
      if (currentSize >= this.maxBytes) {
        await this.rotate();
      }

      await appendFile(this.activePath, line, "utf8",);
    } catch {
      // Silently ignore — logging must not crash the app
    }
  }

  async flush(): Promise<void> {
    // appendFile is awaited per write, so there is no buffered tail to flush.
  }

  /** Rotate the active file: shift `path.N` → `path.(N+1)`, drop oldest. */
  private async rotate(): Promise<void> {
    // Remove oldest first so renames never collide with an existing target.
    if (this.maxFiles > 0) {
      await rm(`${this.activePath}.${this.maxFiles}`, { force: true, },);
    }
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      await rename(`${this.activePath}.${i}`, `${this.activePath}.${i + 1}`,);
    }
    // Default maxFiles=5 → keep path.1..path.5, then rotate current → path.1.
    if (this.maxFiles >= 1) {
      await rename(this.activePath, `${this.activePath}.1`,);
    } else {
      await rm(this.activePath, { force: true, },);
    }
  }

  private async fileSize(path: string,): Promise<number> {
    try {
      const s = await stat(path,);
      return s.size;
    } catch {
      return 0; // file doesn't exist yet
    }
  }
}
