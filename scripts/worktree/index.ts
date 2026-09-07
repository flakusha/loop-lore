// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree management CLI — TypeScript dispatcher
 *
 * All commands are registered here and delegated to ./commands/ modules.
 */

import { abort, } from "./commands/abort";
import { agentCommit, } from "./commands/agent-commit";
import { agentMerge, } from "./commands/agent-merge";
import { attach, } from "./commands/attach";
import { attachDir, } from "./commands/attach-dir";
import { execute as branchesCmd, } from "./commands/branches";
import { execute as cleanupCmd, } from "./commands/cleanup";
import { comment, } from "./commands/comment";
import { commit, } from "./commands/commit";
import { execute as createCmd, } from "./commands/create";
import { execute as diffCmd, } from "./commands/diff";
import { edit, } from "./commands/edit";
import { finalize, } from "./commands/finalize";
import { gi, } from "./commands/gi";
import { issues, } from "./commands/issues";
import { listWorktrees, } from "./commands/list";
import { merge, } from "./commands/merge";
import { execute as newBranchCmd, } from "./commands/new-branch";
import { execute as prsCmd, } from "./commands/prs";
import { rebase, } from "./commands/rebase";
import { execute as removeCmd, } from "./commands/remove";
import { report, } from "./commands/report";
import { search, } from "./commands/search";
import { show, } from "./commands/show";
import { execute as signCmd, } from "./commands/sign";
import { state, } from "./commands/state";
import { execute as statusCmd, } from "./commands/status";
import { sync, } from "./commands/sync";
import { ticket, } from "./commands/ticket";
import { loadConfig, resolveBranch, } from "./utils/config";
import { assertNotInWorktree, getBranches, getStatus, getWorktrees, gitSync, } from "./utils/git";
import { colorize, colors, log, section, } from "./utils/output";

interface CommandHandler {
  description: string;
  run: (args: string[], config: Awaited<ReturnType<typeof loadConfig>>,) => Promise<void>;
}

const commands: Record<string, CommandHandler> = {
  "abort": {
    description:
      "Manually recover a finalize that left dev in a bad state (in-progress merge, leftover stash, stale lock)",
    run: abort,
  },
  "agent-commit": {
    description: "GPG-signed commit in worktree",
    run: agentCommit,
  },
  "agent-merge": {
    description: "Alias for finalize — merge worktree into current branch and clean up",
    run: agentMerge,
  },
  "attach": {
    description: "Attach file to issue as comment",
    run: attach,
  },
  "attach-dir": {
    description: "Attach all files in directory to issue",
    run: attachDir,
  },
  "branches": {
    description: "List branches with status",
    run: branchesCmd,
  },
  "cleanup": {
    description: "Remove stale worktrees for deleted branches",
    run: cleanupCmd,
  },
  "comment": {
    description: "Add comment to issue",
    run: comment,
  },
  "commit": {
    description: "GPG-signed commit on current branch",
    run: commit,
  },
  "create": {
    description: "Create worktree for existing branch",
    run: createCmd,
  },
  "diff": {
    description: "Show diff for worktree branch",
    run: diffCmd,
  },
  "edit": {
    description: "Edit issue metadata",
    run: edit,
  },
  "finalize": {
    description: "Validate, merge, remove worktree, delete branch",
    run: finalize,
  },
  "gi": {
    description: "Run git-issue command directly",
    run: gi,
  },
  "issues": {
    description: "List issues",
    run: issues,
  },
  "list": {
    description: "Show all worktrees with status",
    run: async (_args, config,) => listWorktrees(_args, config,),
  },
  "merge": {
    description: "Merge source branch into worktree branch",
    run: merge,
  },
  "new": {
    description: "Create new branch + worktree",
    run: newBranchCmd,
  },
  "prs": {
    description: "Create worktrees for open PRs",
    run: prsCmd,
  },
  "rebase": {
    description: "Rebase worktree branch onto target",
    run: rebase,
  },
  "remove": {
    description: "Remove specific worktree",
    run: removeCmd,
  },
  "report": {
    description: "Aggregate check-report status across worktrees",
    run: report,
  },
  "search": {
    description: "Search issues by text pattern",
    run: search,
  },
  "show": {
    description: "Show issue details and comments",
    run: show,
  },
  "sign": {
    description: "Configure GPG signing for existing worktree",
    run: signCmd,
  },
  "state": {
    description: "Change issue state",
    run: state,
  },
  "status": {
    description: "Show branch sync status",
    run: statusCmd,
  },
  "sync": {
    description: "Sync ticket index with files + git issues",
    run: sync,
  },
  "ticket": {
    description: "Create ticket file + git issue",
    run: ticket,
  },
  "help": {
    description: "Show this help",
    run: async () => {
      showHelp();
    },
  },
};

function showHelp(): void {
  console.log("",);
  console.log(colorize("Worktree CLI — loop-lore", "cyan",),);
  console.log("",);
  console.log("Commands:",);
  for (const [name, cmd,] of Object.entries(commands,)) {
    console.log(`  ${colorize(name.padEnd(16,), "cyan",)} ${cmd.description}`,);
  }
  console.log("",);
  console.log("Run: worktree <command> [args]",);
  console.log("",);
}

/**
 * Commands that mutate worktree layout (create/rebase/remove/merge trees).
 * They must run from the main repo root — the guard is applied centrally
 * here so new commands cannot forget it. `finalize`/`agent-merge` are the
 * documented exemptions (they resolve the worktree from a branch argument).
 */
const ROOT_ONLY_COMMANDS: Record<string, true> = {
  cleanup: true,
  create: true,
  merge: true,
  new: true,
  rebase: true,
  remove: true,
};

export async function main(): Promise<void> {
  const config = await loadConfig();
  const [cmdName, ...cmdArgs] = process.argv.slice(2,);
  if (!cmdName || cmdName === "help" || !commands[cmdName]) {
    if (cmdName && cmdName !== "help") {
      console.log(colorize(`Unknown command: ${cmdName}`, "red",),);
    }
    showHelp();
    process.exit(cmdName && cmdName !== "help" ? 1 : 0,);
  }

  if (ROOT_ONLY_COMMANDS[cmdName]) {
    assertNotInWorktree(cmdName,);
  }

  try {
    await commands[cmdName].run(cmdArgs, config,);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error,);
    log("error", msg,);
    process.exit(1,);
  }
}

// Allow direct execution
if (import.meta.main) {
  await main();
}
