#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree management CLI — mjs entry point
 *
 * Commands migrated from worktree.sh:
 *   agent-commit  — GPG-signed commit in worktree
 *   list          — show all worktrees with status
 *   status        — show branch sync status
 *   branches      — list branches
 *   diff          — show diff for worktree branch
 *
 * Commands still delegated to worktree.sh:
 *   create, new, sign, merge, rebase, finalize, commit,
 *   ticket, issues, show, comment, edit, state, search, etc.
 */

import { agentCommit } from "./commands/agent-commit.ts";
import { listWorktrees } from "./commands/list.ts";
import { getStatus, getBranches, getWorktrees, gitSync } from "./utils/git";
import { colorize, colors, log } from "./utils/output";

const commands = {
  "agent-commit": agentCommit,
  "list": async () => listWorktrees(),

  "status": async (args) => {
    const [branch] = args;
    if (!branch) {
      log("error", "branch required");
      process.exit(1);
    }
    const repoRoot = import.meta.dirname + "/../..";
    const status = await getStatus(repoRoot, branch);
    console.log(`Branch: ${status.branch}`);
    console.log(`  Ahead:  ${status.ahead}`);
    console.log(`  Behind: ${status.behind}`);
    console.log(`  Clean:  ${status.clean}`);
  },

  "branches": async () => {
    const repoRoot = import.meta.dirname + "/../..";
    const branches = await getBranches(repoRoot);
    for (const b of branches) {
      const marker = b.current ? "* " : "  ";
      const prot = b.protected ? colorize(" (protected)", "gray") : "";
      console.log(`${marker}${b.name}${prot}`);
    }
  },

  "diff": async (args) => {
    const [branch] = args;
    if (!branch) {
      log("error", "branch required");
      process.exit(1);
    }
    const repoRoot = import.meta.dirname + "/../..";
    const output = gitSync(repoRoot, "diff", `master..${branch}`);
    console.log(output || "No differences");
  },

  "help": async () => {
    console.log(`
Worktree CLI

Commands:
  agent-commit <branch> "<message>"  GPG-signed commit in worktree
  list                               Show all worktrees
  status <branch>                    Show branch sync status
  branches                           List branches
  diff <branch>                      Diff branch against master
  help                               Show this help

Other commands delegated to worktree.sh.
`);
  },
};

const [cmd, ...args] = process.argv.slice(2);

if (!cmd || !commands[cmd]) {
  console.log("Unknown command. Run with 'help' for usage.");
  process.exit(1);
}

try {
  await commands[cmd](args);
} catch (err) {
  log("error", err.message || String(err));
  process.exit(1);
}
