// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Production sentinel fs adapter. All failures are best-effort: an integrity
 * sentinel must never prevent the server from booting or shutting down. */
import fs from "node:fs";
import { dirname, } from "node:path";
import type { SentinelFs, } from "./crash-recovery";

export function createNodeSentinelFs(): SentinelFs {
  return {
    exists(path,) {
      try {
        return fs.existsSync(path,);
      } catch {
        return false;
      }
    },
    write(path, data,) {
      try {
        fs.mkdirSync(dirname(path,), { recursive: true, },);
        fs.writeFileSync(path, data, "utf8",);
      } catch {
        // best-effort
      }
    },
    remove(path,) {
      try {
        fs.rmSync(path, { force: true, },);
      } catch {
        // best-effort
      }
    },
    read(path,) {
      try {
        return fs.readFileSync(path, "utf8",);
      } catch {
        return "";
      }
    },
  };
}
