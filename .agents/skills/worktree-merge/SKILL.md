---
name: worktree-merge
description: >
  Merge and rebase operations for loop-lore worktrees. Handles branch
  integration, conflict resolution, and signed merge commits.
  Trigger: "merge branch", "rebase onto", "integrate branch", "/merge", "/rebase".
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Worktree Merge & Rebase

## Overview

Loop-lore uses git worktrees for parallel development. The worktree CLI
(`bun run scripts/worktree/ <command>`) manages merge/rebase operations
within the `tree/` directory.

**Default base branch**: `dev` (protected branches: master, main, stg, dev).

---

## Commands

### Merge

Merges a source branch into a worktree's current branch:

```bash
bun run scripts/worktree/ merge <worktree-branch> <source-branch>
```

Example:

```bash
bun run scripts/worktree/ merge feat feature-api
# Merges 'feature-api' into the 'feat' worktree's branch
```

### Rebase

Rebases a worktree's branch onto a target (default: the main checkout's
current branch, typically `dev`):

```bash
bun run scripts/worktree/ rebase <worktree-branch> [onto]
```

Example:

```bash
bun run scripts/worktree/ rebase feat         # rebase feat onto default base
bun run scripts/worktree/ rebase feat develop # rebase feat onto develop
```

> Worktree-layout commands (`new`, `create`, `merge`, `rebase`, `remove`,
> `cleanup`) must run from the repo root — the CLI rejects them when invoked
> from inside `tree/*`. Issue/ticket commands and read-only queries work from
> any checkout.

---

## Pre-flight Checks

Before merge/rebase, the CLI:

1. **Verifies worktree exists** — exits with error if branch has no worktree
2. **Verifies source/target branch exists** — exits with error if not found
3. **Checks for uncommitted changes** — warns and exits if dirty

If dirty, stash first:

```bash
cd tree/<branch>
git stash
# ... then run merge/rebase
git stash pop
```

---

## Conflict Resolution

### On merge conflict

```bash
# CLI exits with instructions:
cd tree/<branch>
# Resolve conflicts in files, then:
git add .
git commit  # or git merge --continue
```

### On rebase conflict

```bash
# CLI exits with instructions:
cd tree/<branch>
# Resolve conflicts in files, then:
git add .
git rebase --continue

# Or abort:
git rebase --abort
```

---

## Signed Merge Commits

**All commits — including merge commits — must be GPG-signed.**

The worktree CLI auto-signs merge commits via `gpgMergeFlags()`.
When `AGENT_GPG_KEY_ID` is set in `.credentials.env` and the secret key
is available, `merge` and `finalize` pass `-c commit.gpgsign=true
-c user.signingkey=<key>` to git automatically.

If `/tmp/gpg-loopback` exists (non-TTY wrapper), it is used as
`gpg.program` for merge commits. See `agent-commit` skill for details.

### Verification

After any merge, verify the signature:

```bash
git log --show-signature -1
git verify-commit HEAD
```

Both should confirm: Good signature from agent key.

### Manual Merge Commit (Conflict Resolution)

When resolving merge conflicts, sign the commit manually:

```bash
cd tree/<branch>
GIT_COMMITTER_NAME="<AGENT_GPG_NAME>" \
GIT_COMMITTER_EMAIL="<AGENT_GPG_EMAIL>" \
git -c user.signingkey=<AGENT_GPG_KEY_ID> \
    -c commit.gpgsign=true \
    commit -S \
    --author="<user name> <<user email>>"
```

---

## Typical Workflow

```bash
# 0. Unlock GPG (once per session, in real terminal)
bun run scripts/gpg-unlock.mjs

# 1. Create feature worktree (from repo root)
bun run scripts/worktree/ new feature-xyz dev

# 2. Work on feature (commits happen in tree/feature-xyz)
cd tree/feature-xyz
# ... implement feature ...
# Commit with GPG signing (agent-commit skill)

# 3. Sync with dev before merge (back at repo root)
bun run scripts/worktree/ rebase feature-xyz dev

# 4. Or merge another branch in (auto-signed)
bun run scripts/worktree/ merge feature-xyz other-feature

# 5. Verify signature after commit
cd tree/feature-xyz
git log --show-signature -1

# 6. Finalize: run checks, signed merge to base, remove worktree
bun run scripts/worktree/ finalize feature-xyz
# Or: bun run scripts/worktree/ agent-merge feature-xyz
```

---

## Hard Rules

- **NEVER force-push** after rebase on shared branches
- **Always verify** signature after merge commits: `git log --show-signature -1`
- **On conflict** — resolve manually, never `git add .` blindly
- **Check dirty state** before merge/rebase — stash if needed
