// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** One scheduled integrity pass. Bound: a single PRAGMA quick_check, no loop. */
import { getSqliteDatabase, } from "../db/index";
import type { Logger, } from "../logger/types";
import type { IntegrityResult, } from "./crash-recovery";
import { createSqliteIntegrityChecker, } from "./sqlite-check";
import { recordVerdict, } from "./state";

export function runScheduledIntegrityCheck(logger: Logger,): IntegrityResult | { skipped: string } {
  const sqlite = getSqliteDatabase();
  if (!sqlite) {
    return { skipped: "no sqlite handle", };
  }

  const result = createSqliteIntegrityChecker(sqlite,)();
  recordVerdict({ verdict: result.verdict, detail: result.detail, },);
  if (result.verdict === "fail") {
    logger.error("scheduled integrity check failed", undefined, {
      module: "integrity",
      detail: result.detail,
    },);
  }

  return result;
}
