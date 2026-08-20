// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import type { WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";
import { resolveExtid, } from "./resolver";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

export async function show(args: string[], config: WorktreeConfig,): Promise<void> {
  const id = args[0];
  if (!id) {
    log("error", "issue ID required",);
    console.log("  Usage: show <ID>",);
    process.exit(1,);
  }

  const repoRoot = resolve(__dirname, "..", "..", "..",);
  const resolved = resolveExtid(repoRoot, id,);
  if (!resolved) {
    log("error", `issue not found: ${id}`,);
    process.exit(1,);
  }

  const output = gitSync(repoRoot, "issue", "show", resolved.hash,);
  console.log(output,);
}
