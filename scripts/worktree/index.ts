// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worktree management CLI
 */

import { branchToPath, loadConfig, resolveBranch, } from "./utils/config";
import { getBranches, getStatus, getWorktrees, gitSync, } from "./utils/git";
import { colorize, colors, log, section, } from "./utils/output";

export { branchToPath, loadConfig, resolveBranch, } from "./utils/config";
export { getBranches, getStatus, getWorktrees, gitSync, } from "./utils/git";
export { colorize, colors, log, section, } from "./utils/output";

const PROTECTED_BRANCHES = ["master", "main", "stg", "dev",];

export function isProtected(branch: string,): boolean {
  return PROTECTED_BRANCHES.includes(branch,);
}

// Command implementations will go here
// Each command will be a separate module in ./commands/

export interface Command {
  name: string;
  description: string;
  execute: (args: string[], config: Awaited<ReturnType<typeof loadConfig>>,) => Promise<void>;
}

export const commands: Command[] = [
  // Will be populated as we add command modules
];
