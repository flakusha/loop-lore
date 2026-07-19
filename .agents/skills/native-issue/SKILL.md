---
name: native-issue
description: >
  Native git issue tracking for loop-lore. Uses git-native-issue for
  distributed, Git-embedded issues without external services.
  Trigger: "git issue", "create ticket", "issue tracking", "native issue".
---

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
./scripts/worktree.sh ticket BUG 001 "Fix login crash"
# Creates issue BUG-2025-001 + worktree in tree/ticket-BUG-2025-001/
```

### Create Epic

```bash
./scripts/worktree.sh epic 16
# Creates branch epic/16 + worktree in tree/epic-16/
```

### List Issues

```bash
./scripts/worktree.sh issues
# Lists open issues with branch mapping
```

### Run git-issue Directly

```bash
./scripts/worktree.sh issue <args>
# Passes through to git-issue command
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
./scripts/worktree.sh issue import github:owner/repo

# Export to GitHub
./scripts/worktree.sh issue export github:owner/repo

# Two-way sync
./scripts/worktree.sh issue sync github:owner/repo --state all
```

## Data Location

- Issues: `refs/issues/` (Git refs, not working tree files)
- Templates: `.plan/tickets/template.md`
- Epics: `.plan/epics/`
- Solutions: `.plan/solutions/`
- Seeds: `.plan/seeds/`
