---
name: native-issue
description: >
  Native git issue tracking for loop-lore. Uses git-native-issue for
  distributed, Git-embedded issues without external services.
  Trigger: "git issue", "create ticket", "issue tracking", "native issue".
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Native Issue Tracking

Loop-lore uses **git-native-issue** for distributed issue tracking. Issues
live in `refs/issues/<uuid>` as commit chains with trailers for metadata.

## Extended Identifiers

| Type  | Prefix                        | Use for |
| ----- | ----------------------------- | ------- |
| BUG-  | Bug reports                   |         |
| FEA-  | Feature requests              |         |
| FIX-  | Non-bug fixes                 |         |
| IDEA- | Research/experimental ideas   |         |
| TASK- | Small tasks                   |         |
| SOL-  | Architectural solutions       |         |
| EPIC- | Major epics (matches plan.md) |         |

## Commands

### Create Ticket

```bash
./scripts/worktree/ ticket BUG "Fix login crash" -l bug -p high
# Creates .plan/tickets/BUG-fix-login-crash.md + git issue BUG-fix-login-crash
```

### Create Epic

```bash
./scripts/worktree/ epic 16
# Creates branch epic/16 + worktree in tree/epic-16/
```

### List Issues

```bash
./scripts/worktree/ issues
# Lists open issues with branch mapping
```

### Show / Inspect an Issue

```bash
./scripts/worktree/ show TASK-001
# Full issue detail (metadata, body, trailers)
```

### Search Issues

```bash
./scripts/worktree/ search "combat"
# Fuzzy search across all issues
```

### Comment on an Issue

```bash
./scripts/worktree/ comment TASK-001 -m "blocked on schema"
# Appends a comment to the issue chain
```

### Edit an Issue

```bash
./scripts/worktree/ edit TASK-001 --title "New title" --body "New body"
# Amends issue metadata/body
```

### Change Issue State

```bash
./scripts/worktree/ state TASK-001 in_progress
# Transitions issue status (open|in_progress|done|blocked)
```

### Attach Files

```bash
./scripts/worktree/ attach TASK-001 ./spec.md
# Attach a single file to the issue
./scripts/worktree/ attach-dir TASK-001 ./design-notes/
# Attach every file in a directory
```

### Run git-issue Directly

```bash
./scripts/worktree/ gi <args>
# Passes through to git-issue command (alias for `issue`)
```

### Shortcut: `git issue` in Worktree

All subcommands above also work via the canonical `issue` dispatch:

```bash
./scripts/worktree/ issue show TASK-001
./scripts/worktree/ issue search "combat"
./scripts/worktree/ issue attach TASK-001 ./spec.md
```

## Commit Trailers

Link commits to issues using trailers:

```
Issue: BUG-2025-001
Epic: EPIC-16
Status: done
Solution: SOL-2025-001
```

Trailers are parsed automatically. `git issue ls` shows issues;
`git for-each-ref --format='%(trailers:key=Issue,valueonly)' refs/heads/`
queries them.

## Workflow Integration

1. `ticket` command creates both issue and worktree
2. Branch naming: `ticket/<ID>` maps to issue `<ID>`
3. Epic branches: `epic/<num>` for plan.md epics
4. Solutions: `solution/<ID>` for architecture work

## Sync with External Platforms

```bash
# Import from GitHub (requires gh CLI)
./scripts/worktree/ issue import github:owner/repo

# Export to GitHub
./scripts/worktree/ issue export github:owner/repo

# Two-way sync
./scripts/worktree/ issue sync github:owner/repo --state all
```

## Data Location

- Issues: `refs/issues/` (Git refs, not working tree files)
- Templates: `.plan/tickets/template.md`
- Epics: `.plan/epics/`
- Solutions: `.plan/solutions/`
- Seeds: `.plan/seeds/`
