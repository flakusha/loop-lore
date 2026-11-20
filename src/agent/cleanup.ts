// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Hourly sweeper for agent worktrees idle longer than 24h (and for rows
 * that grew past the 500MB cap). The sweep is exported as a pure function
 * so a test can drive it with a fake clock and a 25h-old row.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { parseExpiryMs, toDate, } from "../utils/date";
import { MAX_WORKTREE_BYTES, } from "./api/sandbox";
import type { RemoveWorktree, } from "./api/types";

export const MAX_WORKTREE_IDLE_MS = 24 * 60 * 60 * 1000;
export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export interface CleanupOpts {
  database: Kysely<DB>;
  /** Injectable so tests never touch a real worktree path. */
  removeWorktree: RemoveWorktree;
  cwd?: string;
  nowMs?: () => number;
}

/** @returns number of worktrees actually removed in this sweep. */
export async function cleanupIdleWorktrees(opts: CleanupOpts,): Promise<number> {
  const nowMs = opts.nowMs?.() ?? Date.now();
  const rows = await opts.database
    .selectFrom("rsi_agent_worktrees",)
    .select(["id", "path", "last_active_at", "disk_bytes", "created_at",],)
    .where("removed_at", "is", null,)
    .execute();

  let removed = 0;
  for (const row of rows) {
    const lastMs = parseExpiryMs(row.last_active_at,);
    const idle = lastMs !== null && nowMs - lastMs > MAX_WORKTREE_IDLE_MS;
    const oversize = row.disk_bytes > MAX_WORKTREE_BYTES;
    if (!idle && !oversize) { continue; }

    try {
      await opts.removeWorktree({ cwd: opts.cwd ?? process.cwd(), path: row.path, },);
    } catch {
      // A failed removal leaves the row active — the next sweep retries.
      continue;
    }

    await opts.database
      .updateTable("rsi_agent_worktrees",)
      .set({ removed_at: toDate(nowMs,).toISOString(), },)
      .where("id", "=", row.id,)
      .execute();

    removed++;
  }

  return removed;
}

/** Starts the hourly timer; returns a stop handle for tests/shutdown. */
export function startWorktreeCleanup(opts: CleanupOpts,): () => void {
  const timer = setInterval(() => {
    void cleanupIdleWorktrees(opts,).catch(() => {
      // best effort — a failed sweep is retried next hour
    },);
  }, CLEANUP_INTERVAL_MS,);

  timer.unref?.();
  return () => clearInterval(timer,);
}
