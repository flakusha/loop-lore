// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 * @module logger-transports-file
 */

import { appendFile, mkdir, rename, rm, stat, } from "node:fs/promises";
import { dirname, } from "node:path";
import { formatJSONL, } from "../formatters";
import type { LogEntry, Transport, } from "../types";

/** */
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
  /** Serializes write() calls so rotation + append never interleave. */
  private writeChain: Promise<void> = Promise.resolve();

  /**
   * @param options
   */
  constructor(options: FileTransportOptions,) {
    this.activePath = options.path;
    this.maxBytes = options.maxBytes ?? 100 * 1024 * 1024;
    this.maxFiles = options.maxFiles ?? 5;
  }

  /**
   * @param entry
   */
  async write(entry: LogEntry,): Promise<void> {
    // Chain writes through a mutex: a size-check-then-append is not atomic,
    // so concurrent writes can race the rotate() step and lose/misplace lines.
    // Each write awaits the previous one's completion before starting.
    const next = this.writeChain.then(() => this.writeLocked(entry,));
    // Detach the error so a single failed write (already swallowed internally)
    // does not poison every subsequent queued write with a rejection.
    this.writeChain = next.catch(() => {
      // already swallowed by writeLocked
    },);
    return next;
  }

  /**
   * @param entry
   */
  private async writeLocked(entry: LogEntry,): Promise<void> {
    try {
      const line = formatJSONL(entry,);
      await mkdir(dirname(this.activePath,), { recursive: true, mode: 0o700, },);

      const currentSize = await this.fileSize(this.activePath,);
      if (currentSize >= this.maxBytes) {
        await this.rotate();
      }

      await appendFile(this.activePath, line, { encoding: "utf8", mode: 0o600, },);
    } catch {
      // Silently ignore — logging must not crash the app
    }
  }

  /** */
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

  /**
   * @param path
   */
  private async fileSize(path: string,): Promise<number> {
    try {
      const s = await stat(path,);
      return s.size;
    } catch {
      return 0; // file doesn't exist yet
    }
  }
}
