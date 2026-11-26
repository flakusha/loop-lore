// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Live `PRAGMA quick_check` binding. quick_check is a bounded, single-pass
 * SQLite scan (no infinite loop); the cron schedule bounds frequency. It
 * returns one row (`ok`) when clean and one row per problem otherwise.
 */
import type { Database, } from "bun:sqlite";
import type { IntegrityChecker, IntegrityResult, } from "./crash-recovery";

/** Create a checker bound to a raw bun:sqlite handle. */
export function createSqliteIntegrityChecker(sqlite: Database,): IntegrityChecker {
  return (): IntegrityResult => {
    const rows = sqlite.query<{ quick_check: string }, []>("PRAGMA quick_check;",).all();
    const problems = rows.map((row,) => row.quick_check).filter((value,) => value !== "ok");
    if (problems.length === 0) {
      return { verdict: "pass", detail: "ok", };
    }

    return { verdict: "fail", detail: problems.join("; ",), };
  };
}
