// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sync command — thin shim over `giwt sync` (ticket index with files + git issues).
 *
 * The in-repo implementation (scripts/sync-ticket-index.ts) was removed once
 * `plan:sync` moved to giwt. Runs in the caller's checkout so giwt resolves
 * worktree-aware paths; the old shim forced the main repo root. Flags pass
 * through verbatim — giwt owns validation.
 */

import { type WorktreeConfig, } from "../utils/config";
import { log, } from "../utils/output";

export async function sync(
  args: string[],
  _config: WorktreeConfig,
): Promise<void> {
  log("info", "Syncing ticket index...",);

  const result = Bun.spawnSync(
    ["giwt", "sync", ...args,],
    { stdout: "inherit", stderr: "inherit", },
  );

  if (result.exitCode !== 0) {
    log("error", `sync failed (exit ${result.exitCode})`,);
    process.exit(1,);
  }

  log("success", "Ticket index synced",);
}
