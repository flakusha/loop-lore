// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import type { WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

export async function search(args: string[], config: WorktreeConfig,): Promise<void> {
  const pattern = args[0];

  if (!pattern) {
    log("error", "search pattern required",);
    console.log("  Usage: search <pattern>",);
    process.exit(1,);
  }

  const repoRoot = resolve(__dirname, "..", "..", "..",);
  log("info", `searching issues for: ${pattern}`,);
  const output = gitSync(repoRoot, "issue", "search", pattern,);
  console.log(output || "no matches",);
}
