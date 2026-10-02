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

import { statSync, } from "node:fs";
import { resolve, } from "node:path";

import { type WorktreeConfig, } from "../utils/config";
import { log, } from "../utils/output";

/** Path of the pinned giwt entrypoint relative to a checkout root. */
export const GIWT_CLI_RELATIVE = "node_modules/giwt/src/cli.ts";

/**
 * True when `path` resolves to a regular file, following symlinks.
 *
 * `existsSync` is not enough: a DIRECTORY at the entrypoint path (a partial
 * or corrupt install) passes it, then hard-fails the spawn with "Module not
 * found" — turning a recoverable condition into a crash. `statSync` (not
 * `lstatSync`) follows symlinks on purpose: a worktree's `node_modules` is a
 * symlink to the dev checkout, and the cli.ts behind it must be a real file.
 */
function isFile(path: string,): boolean {
  try {
    return statSync(path,).isFile();
  } catch {
    return false;
  }
}

/**
 * argv for invoking the pinned `giwt`.
 *
 * Resolution is PIN-ANCHORED, not ambient: a bare `giwt` on PATH resolves to
 * whatever the operator has linked (~/.local/bin/giwt points at a mutable
 * local checkout), which silently runs an unpinned build. Spawning the copy
 * under `node_modules/giwt` — the commit `bun.lock` pins — keeps this shim on
 * the same version as the `plan:*` scripts. Worktrees symlink `node_modules`
 * to the dev checkout, so the pinned copy is shared, not duplicated.
 *
 * Falls back to the bare `giwt` name when the pinned copy is not a readable
 * file (uninstalled, vendored, or a half-written checkout). Failing loudly
 * instead would break the documented recovery path for a condition the caller
 * cannot fix.
 *
 * The interpreter itself is env-specific, resolved in exactly one place here
 * so the boundary stays visible instead of scattered across call sites:
 * `process.execPath` ("bun") + the unbundled `.ts` entrypoint, and
 * `Bun.spawnSync` below. Node/Deno cannot run either as-is — `execPath` would
 * be the node/deno binary, which cannot execute a `.ts` file, and
 * `Bun.spawnSync` has no counterpart. Both would need a runtime adapter
 * (child_process / Deno.Command) selected once, not per call site.
 *
 * TODO(env): `scripts/` is bun-only by declaration (AGENTS.md Technology
 * Constraints: Runtime = Bun) and by enforcement — `audit-runtime-compat.ts`
 * scans `src/` only, so nothing here is gated for portability. This file is
 * NOT the whole porting surface: `Bun.spawnSync` is the standard spawn
 * primitive across `scripts/` (every worktree command, `check-parallel.mjs`,
 * the build scripts), so a second runtime would need one adapter over spawn,
 * not a per-file shim. Porting point for THIS file: `giwtArgv` (line 73) plus
 * the `Bun.spawnSync` in `sync()` (line 85). Trigger: a second runtime
 * becoming real for the tooling layer (not for `src/`, which is what that
 * audit tracks). Until then a runtime adapter here would be a hypothetical
 * environment — YAGNI.
 */
export function giwtArgv(repoRoot: string,): { cmd: string; args: string[] } {
  const pinned = resolve(repoRoot, GIWT_CLI_RELATIVE,);
  if (isFile(pinned,)) {
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
