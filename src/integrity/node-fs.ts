// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Production sentinel fs adapter. All failures are best-effort: an integrity
 * sentinel must never prevent the server from booting or shutting down. */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { dirname, } from "node:path";
import type { SentinelFs, } from "./crash-recovery";

export function createNodeSentinelFs(): SentinelFs {
  return {
    exists(path,) {
      try {
        return existsSync(path,);
      } catch {
        return false;
      }
    },
    write(path, data,) {
      try {
        mkdirSync(dirname(path,), { recursive: true, },);
        writeFileSync(path, data, "utf8",);
      } catch {
        // best-effort
      }
    },
    remove(path,) {
      try {
        rmSync(path, { force: true, },);
      } catch {
        // best-effort
      }
    },
    read(path,) {
      try {
        return readFileSync(path, "utf8",);
      } catch {
        return "";
      }
    },
  };
}
