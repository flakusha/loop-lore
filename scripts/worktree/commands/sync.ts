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

import { existsSync, } from "node:fs";
import { resolve, } from "node:path";

import { type WorktreeConfig, } from "../utils/config";
import { log, } from "../utils/output";

/** Path of the pinned giwt entrypoint relative to a checkout root. */
export const GIWT_CLI_RELATIVE = "node_modules/giwt/src/cli.ts";

/**
 * argv for invoking the pinned `giwt`. Runs the TypeScript entrypoint through
 * the current interpreter (`bun`) rather than executing it directly — giwt
 * ships unbundled `.ts` and is bun-only.
 *
 * Resolution is PIN-ANCHORED, not ambient: a bare `giwt` on PATH resolves to
 * whatever the operator has linked (~/.local/bin/giwt points at a mutable
 * local checkout), which silently runs an unpinned build. Spawning the copy
 * under `node_modules/giwt` — the commit `bun.lock` pins — keeps this shim on
 * the same version as the `plan:*` scripts. Worktrees symlink `node_modules`
 * to the dev checkout, so the pinned copy is shared, not duplicated.
 *
 * Falls back to the bare `giwt` name when the pinned copy is absent (an
 * uninstalled or vendored checkout). Failing loudly instead would break the
 * documented recovery path for a condition the caller cannot fix.
 */
export function giwtArgv(repoRoot: string,): { cmd: string; args: string[] } {
  const pinned = resolve(repoRoot, GIWT_CLI_RELATIVE,);
  if (existsSync(pinned,)) {
    return { cmd: process.execPath, args: [pinned,], };
  }
  return { cmd: "giwt", args: [], };
}

export async function sync(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  log("info", "Syncing ticket index...",);

  const { cmd, args: prefix, } = giwtArgv(config.repoRoot,);
  const result = Bun.spawnSync(
    [cmd, ...prefix, "sync", ...args,],
    { stdout: "inherit", stderr: "inherit", },
  );

  if (result.exitCode !== 0) {
    log("error", `sync failed (exit ${result.exitCode})`,);
    process.exit(1,);
  }

  log("success", "Ticket index synced",);
}
