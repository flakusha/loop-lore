// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import type { WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";
import { log, } from "../utils/output";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

export async function issues(args: string[], config: WorktreeConfig,): Promise<void> {
  let showAll = false;
  let format = "oneline";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--all":
      case "-a":
        showAll = true;
        break;
      case "--format":
      case "-f":
        format = args[++i];
        break;
    }
  }

  const repoRoot = resolve(__dirname, "..", "..", "..",);
  const output = gitSync(repoRoot, "issue", "ls", "--format", format,);
  const lines = output.split("\n",).filter(Boolean,);

  if (lines.length === 0) {
    log("info", "no issues found",);
    return;
  }

  log("info", `issues (${showAll ? lines.length : Math.min(lines.length, 50,)}):`,);
  const display = showAll ? lines : lines.slice(0, 50,);
  console.log(display.join("\n",),);
}
