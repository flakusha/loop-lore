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

Valid ticket types (as accepted by the `ticket` command):

| Prefix | Use for                     |
| ------ | --------------------------- |
| BUG-   | Bug reports                 |
| FEAT-  | Feature requests            |
| FIX-   | Non-bug fixes               |
| IDEA-  | Research/experimental ideas |
| TASK-  | Small tasks                 |
| SOL-   | Architectural solutions     |
| INFRA- | Infrastructure work         |

Epics are NOT tickets — they live as files in `.plan/epics/` and their index
is regenerated with `bun run plan:docs`.

## Commands

All commands run via `giwt <command>` (from any checkout;
the CLI resolves the main repo root itself).

### Create Ticket

```bash
giwt ticket BUG "Fix login crash" --label bug --priority high
# Creates .plan/tickets/BUG-fix-login-crash.md + git issue BUG-FIX-LOGIN-CRASH
# Multiple labels: repeat --label or pass comma-separated: --label bug,auth
```

### List Issues

```bash
giwt issues
```

### Show / Inspect an Issue

```bash
giwt show TASK-001
# Full issue detail (metadata, body, trailers)
```

### Search Issues

```bash
giwt search "combat"
```

### Comment on an Issue

```bash
giwt comment TASK-001 -m "blocked on schema"
```

### Edit an Issue

```bash
giwt edit TASK-001 --title "New title" --body "New body"
```

### Change Issue State

```bash
giwt state TASK-001 closed
# Valid states: open | closed
```

### Attach Files

```bash
giwt attach TASK-001 ./spec.md
giwt attach-dir TASK-001 ./design-notes/
```

### Run git-issue Directly

```bash
giwt gi <args>
# Passes through to the git-issue CLI
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

1. `ticket` creates both a `.plan/tickets/*.md` file and a linked git issue
2. Keep file ↔ issue ↔ index in sync with `bun run plan:sync` (fix: `plan:sync:fix`)
3. Epics live in `.plan/epics/`; regenerate `epics-index.md` with `bun run plan:docs`

## Data Location

- Issues: `refs/issues/` (Git refs, not working tree files)
- Tickets: `.plan/tickets/` (+ `index.json`)
- Epics: `.plan/epics/`
