// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Concurrency + disk caps for agent-owned worktrees. */
import type { Kysely, } from "kysely";
import { readdir, stat, } from "node:fs/promises";
import { join, } from "node:path";
import type { DB, } from "../../db/schema";

export const MAX_WORKTREES_PER_TOKEN = 5;
export const MAX_WORKTREES_GLOBAL = 10;
export const MAX_WORKTREE_BYTES = 500 * 1024 * 1024;

export interface SandboxDecision {
  allowed: boolean;
  reason?: string;
}

/** Count live rows only — `removed_at` is the tombstone, not a DELETE. */
export async function checkWorktreeCapacity(
  database: Kysely<DB>,
  tokenId: string,
): Promise<SandboxDecision> {
  const active = await database
    .selectFrom("rsi_agent_worktrees",)
    .select(["token_id",],)
    .where("removed_at", "is", null,)
    .execute();

  if (active.filter((row,) => row.token_id === tokenId).length >= MAX_WORKTREES_PER_TOKEN) {
    return { allowed: false, reason: "per-token worktree limit reached", };
  }

  if (active.length >= MAX_WORKTREES_GLOBAL) {
    return { allowed: false, reason: "global worktree limit reached", };
  }

  return { allowed: true, };
}

/**
 * Recursive byte count. Symlinks are skipped (isDirectory/isFile are false),
 * so a symlink loop cannot spin forever.
 */
export async function measureDirectoryBytes(path: string,): Promise<number> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true, },);
  } catch {
    return 0;
  }

  let total = 0;
  for (const entry of entries) {
    const full = join(path, entry.name,);
    if (entry.isDirectory()) {
      total += await measureDirectoryBytes(full,);
    } else if (entry.isFile()) {
      try {
        total += (await stat(full,)).size;
      } catch {
        // file vanished mid-walk — ignore
      }
    }
  }

  return total;
}
