// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { dirname, resolve, } from "path";
import { fileURLToPath, } from "url";
import type { WorktreeConfig, } from "../utils/config";
import { gitSync, } from "../utils/git";

const __filename = fileURLToPath(import.meta.url,);
const __dirname = dirname(__filename,);

export async function gi(args: string[], config: WorktreeConfig,): Promise<void> {
  const repoRoot = resolve(__dirname, "..", "..", "..",);
  const output = gitSync(repoRoot, "issue", ...args,);
  console.log(output,);
}
