// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gripe command — let agents vent at each other on the shared ledger.
 *
 * Usage: worktree gripe [--at <branch>] <message...>
 *
 * The message is free text ("you left dev mid-merge again"); --at tags
 * which branch/agent it's aimed at. Stored as a `gripe` ledger record so
 * it shows up in `worktree ledger` and `finalize` dumps alongside the
 * auto-appended run records. Self-logging: the dispatcher skips the
 * generic auto-append for this command (see LEDGER_SILENT_COMMANDS).
 */

import type { WorktreeConfig, } from "../utils/config";
import { appendLedger, formatRecord, readLedger, } from "../utils/ledger";
import { log, } from "../utils/output";

export async function gripe(
  args: string[],
  config: WorktreeConfig,
): Promise<void> {
  let at = "";
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--at") {
      const value = args[++i];
      if (value === undefined || value.trim().length === 0) {
        log("error", "--at requires a branch name",);
        console.log("  Usage: worktree gripe [--at <branch>] <message...>",);
        process.exit(1,);
      }
      at = value;
    } else if (arg.startsWith("--at=",)) {
      const value = arg.slice("--at=".length,);
      if (value.trim().length > 0) { at = value; }
    } else {
      words.push(arg,);
    }
  }

  const message = words.join(" ",).trim();
  if (message.length === 0) {
    log("error", "gripe message required",);
    console.log("  Usage: worktree gripe [--at <branch>] <message...>",);
    process.exit(1,);
  }

  appendLedger(config.treeDir, "gripe", at === "" ? [] : [at,], `😤 ${message}`,);
  const latest = readLedger(config.treeDir, 1,).at(-1,);
  log("success", "Gripe recorded — the ledger remembers",);
  if (latest) { console.log(`  ${formatRecord(latest,)}`,); }
}
