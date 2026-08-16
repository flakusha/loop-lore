// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * ConsoleTransport — always-active transport for human-readable output.
 *
 * Writes debug/info to stdout, warn/error to stderr.
 * Catches write errors silently — never throws.
 */

import { formatConsole, } from "../formatters";
import type { LogEntry, Transport, } from "../types";

const isTty = process.stdout.isTTY;

export class ConsoleTransport implements Transport {
  private readonly isColor: boolean;

  readonly name = "console";

  constructor(isColor?: boolean,) {
    this.isColor = isColor ?? isTty;
  }

  write(entry: LogEntry,): Promise<void> {
    try {
      const line = formatConsole(entry, this.isColor,);
      const stream = entry.level >= 30 ? process.stderr : process.stdout;
      stream.write(line,);
    } catch {
      // Silently ignore write errors — logging must not crash the app
    }
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
