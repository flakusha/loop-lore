// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sync command — sync ticket index with files + git issues
 */

import { existsSync, } from "fs";
import { resolve, } from "path";
import { type WorktreeConfig, } from "../utils/config";
import { log, } from "../utils/output";

export async function sync(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  const syncScript = resolve(config.repoRoot, "scripts", "sync-ticket-index.ts",);

  if (!existsSync(syncScript,)) {
    log("error", "sync-ticket-index.ts not found",);
    process.exit(1,);
  }

  const hasFix = args.includes("--fix",);
  const hasVerbose = args.includes("--verbose",);

  const cmdArgs = [syncScript,];
  if (hasFix) { cmdArgs.push("--fix",); }
  if (hasVerbose) { cmdArgs.push("--verbose",); }

  log("info", "Syncing ticket index...",);

  const result = Bun.spawnSync(
    ["bun", "run", ...cmdArgs,],
    { stdout: "inherit", stderr: "inherit", cwd: config.repoRoot, },
  );

  if (result.exitCode !== 0) {
    log("error", `sync failed (exit ${result.exitCode})`,);
    process.exit(1,);
  }

  log("success", "Ticket index synced",);
}
