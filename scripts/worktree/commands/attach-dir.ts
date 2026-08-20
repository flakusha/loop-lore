// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { readdirSync, statSync, } from "fs";
import { dirname, join, resolve, } from "path";
import { fileURLToPath, } from "url";
import type { WorktreeConfig, } from "../utils/config";
import { log, } from "../utils/output";
import { attach, } from "./attach";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

export async function attachDir(args: string[], config: WorktreeConfig,): Promise<void> {
  const id = args[0];
  const dirPath = args[1];

  if (!id || !dirPath) {
    log("error", "issue ID and directory required",);
    console.log("  Usage: attach-dir <ID> <DIR>",);
    process.exit(1,);
  }

  if (!statSync(dirPath, { throwIfNoEntry: false, },)?.isDirectory()) {
    log("error", `directory not found: ${dirPath}`,);
    process.exit(1,);
  }

  log("info", `attaching files from ${dirPath} to issue ${id}`,);
  let count = 0;

  for (const name of readdirSync(dirPath,)) {
    const fp = join(dirPath, name,);
    if (!statSync(fp,).isFile()) { continue; }
    await attach([id, fp,], config,);
    count++;
  }

  log("success", `attached ${count} files`,);
}
