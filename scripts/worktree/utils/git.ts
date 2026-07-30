// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Git operation utilities for worktree management
 */

export interface GitBranch {
  name: string
  current: boolean
  protected: boolean
}

export interface GitWorktree {
  path: string
  branch: string
  HEAD: string
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  clean: boolean
}

const PROTECTED_BRANCHES = ['master', 'main', 'stg', 'dev']

export function isProtected(branch: string): boolean {
  return PROTECTED_BRANCHES.includes(branch)
}

export function gitSync(repoRoot: string, ...args: string[]): string {
  const cmd = ['git', '-C', repoRoot, ...args].join(' ')
  const result = Bun.spawnSync(cmd, { shell: true })
  return result.stdout.toString().trim()
}

export async function getBranches(repoRoot: string): Promise<GitBranch[]> {
  const output = gitSync(repoRoot, 'branch', '--format=%(refname:short)')
  const current = gitSync(repoRoot, 'branch', '--show-current')
  return output
    .split('\n')
    .filter((b) => b.trim())
    .map((b) => ({
      name: b.trim().replace(/^\* /, ''),
      current: b.trim() === current,
      protected: isProtected(b.trim()),
    }))
}

export async function getWorktrees(repoRoot: string): Promise<GitWorktree[]> {
  const output = gitSync(repoRoot, 'worktree', 'list', '--porcelain')
  const worktrees: GitWorktree[] = []
  let current: GitWorktree | null = null

  for (const line of output.split('\n')) {
    if (line.startsWith('path ')) {
      if (current) worktrees.push(current)
      current = { path: line.slice(5), branch: '', HEAD: '' }
    } else if (line.startsWith('branch ')) {
      if (current) current.branch = line.slice(7)
    } else if (line.startsWith('HEAD ')) {
      if (current) current.HEAD = line.slice(5)
    }
  }
  if (current) worktrees.push(current)
  return worktrees
}

export async function getStatus(
  repoRoot: string,
  branch: string
): Promise<GitStatus> {
  const aheadStr = gitSync(repoRoot, 'rev-list', '--count', `master..${branch}`)
  const behindStr = gitSync(repoRoot, 'rev-list', '--count', `${branch}..master`)
  const ahead = parseInt(aheadStr || '0', 10)
  const behind = parseInt(behindStr || '0', 10)
  const dirty = gitSync(repoRoot, 'diff', '--quiet')
  return {
    branch,
    ahead,
    behind,
    clean: dirty === '',
  }
}