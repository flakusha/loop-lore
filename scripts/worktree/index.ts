// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree management CLI — TypeScript dispatcher
 *
 * All commands are registered here and delegated to ./commands/ modules.
 */

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
import { loadConfig, resolveBranch, type WorktreeConfig, } from "./utils/config";
import { getBranches, getStatus, getWorktrees, gitSync, } from "./utils/git";
import { colorize, colors, log, section, } from "./utils/output";

export { branchToPath, loadConfig, resolveBranch, } from "./utils/config";
export { getBranches, getStatus, getWorktrees, gitSync, } from "./utils/git";
export { colorize, colors, log, section, } from "./utils/output";

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

export function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

interface CommandHandler {
  description: string;
  run: (args: string[], config: Awaited<ReturnType<typeof loadConfig>>,) => Promise<void>;
}

const commands: Record<string, CommandHandler> = {
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
    usage: "attach <ID> <file>",
  },
  "attach-dir": {
    description: "Attach all files in directory to issue",
    run: attachDir,
    usage: "attach-dir <ID> <dir>",
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
    usage: "comment <ID> -m <text>",
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
    usage: "edit <ID> [--label X] [--assignee X] [--priority X]",
  },
  "finalize": {
    description: "Validate, merge, remove worktree, delete branch",
    run: finalize,
  },
  "gi": {
    description: "Run git-issue command directly",
    run: gi,
    usage: "gi <git-issue-subcommand> [args]",
  },
  "issues": {
    description: "List issues",
    run: issues,
    usage: "issues [--all] [--format oneline|json]",
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
    usage: "new <branch-name>",
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
    usage: "search <pattern>",
  },
  "show": {
    description: "Show issue details and comments",
    run: show,
    usage: "show <ID>",
  },
  "sign": {
    description: "Configure GPG signing for existing worktree",
    run: signCmd,
  },
  "state": {
    description: "Change issue state",
    run: state,
    usage: "state <ID> <open|closed>",
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
    usage: "ticket <TYPE> <title> [body] [-l label] [-p priority] [-e epic] [--effort S|M|L|XL]",
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
  console.log("Per-command help: worktree <command> --help",);
  console.log("",);
}

function showCommandHelp(name: string,): void {
  const cmd = commands[name];
  console.log("",);
  console.log(`${colorize(name, "cyan",)} — ${cmd.description}`,);
  if (cmd.usage) {
    console.log("",);
    console.log(`  Usage: worktree ${cmd.usage}`,);
  }
  console.log("",);
}

export async function main(): Promise<void> {
  const config = await loadConfig();
  const [cmdName, ...cmdArgs] = process.argv.slice(2,);

  if (commands[cmdName] && cmdArgs.some((a,) => a === "-h" || a === "--help")) {
    showCommandHelp(cmdName,);
    process.exit(0,);
  }

  if (!cmdName || cmdName === "help" || !commands[cmdName]) {
    if (cmdName && cmdName !== "help") {
      console.log(colorize(`Unknown command: ${cmdName}`, "red",),);
    }
    showHelp();
    process.exit(cmdName && cmdName !== "help" ? 1 : 0,);
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
