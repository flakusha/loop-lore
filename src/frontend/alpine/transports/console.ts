/**
 * BrowserConsoleTransport — writes formatted entries to console.
 *
 * Uses `formatConsole` with CSS mode for colored output.
 */

import { formatConsole, } from "../../../logger/formatters";
import type { LogEntry, Transport, } from "../../../logger/types";

export class BrowserConsoleTransport implements Transport {
  readonly name = "browser-console";
  private readonly isColor: boolean;

  constructor(isColor?: boolean,) {
    this.isColor = isColor ?? true;
  }

  write(entry: LogEntry,): Promise<void> {
    try {
      const { formatted, css, } = formatConsole(entry, this.isColor, "css",);
      const fn = this.consoleMethod(entry.level,);
      if (css) {
        fn(formatted, css,);
      } else {
        fn(formatted,);
      }
    } catch {
      // Never throw from transport
    }
    return Promise.resolve();
  }

  flush(): Promise<void> {
    return Promise.resolve();
  }

  private consoleMethod(level: number,): (...args: unknown[]) => void {
    if (level >= 40) { return console.error; }
    if (level >= 30) { return console.warn; }
    if (level >= 20) { return console.info; }
    return console.debug;
  }
}
