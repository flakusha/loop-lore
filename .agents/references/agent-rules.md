<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Agent Rules — loop-lore

Repo-local coding-agent rules. These are **tracked** (unlike the untracked,
gitignored `.omp/` config) so they survive review and history. They are the
single source of truth for agent behavior in this repo; the global
`~/.omp/agent/` rules own cross-project behavior.

> **Tool surface**: the global `~/.omp/agent/AGENTS.md` is authoritative on
> tool routing (lean-ctx `ctx_*` MCP tools vs native `read`/`grep`/`glob`/`bash`,
> and on rerouting admonitions). This file does not re-litigate that — follow
> the global config. The notes below are repo-specific additions only.

## 1. No git working-tree investigation

During implementation tasks, do not audit git working-tree state; implement
directly on the current branch. Do NOT run `git status`, `git rev-parse`, or
`git branch --show-current`, and do NOT tally dirty files to "understand the
working tree" before editing. Pre-existing uncommitted files are not yours to
inspect or sweep; stage only your target files at commit time. Investigate the
code, not the repo bookkeeping.

## 2. No unsourced framework claims

Never assert framework capabilities/limitations without reading actual source
or docs. Before claiming what a framework does or doesn't support, READ THE
ACTUAL SOURCE CODE or docs (documentation MCP tools, the framework's source,
or real examples). Stop asserting limitations from memory — training data may
be wrong or outdated.

## 3. Premature task completion

Do not report a task as done until every acceptance criterion is actually met
with observable evidence (a test run, an executed path, a reproduction). A
passing-looking diff is not completion; verify the changed surface behaves.

## 4. Plan sync after artifact edits

After editing any planning artifact — epics (`.plan/epics/`), tickets
(`.plan/tickets/`), backlog (`.plan/backlog/`), or their indexes — verify the
derived indexes are reconciled with their sources. Orphaned files or stale
index entries are bugs. The reconciliation commands are **distinct**:

| Artifact edited            | Sync command                | What it reconciles                 |
| -------------------------- | --------------------------- | ---------------------------------- |
| Tickets (`.plan/tickets/`) | `bun run plan:sync:fix`     | `index.json` ↔ `.md` ↔ git issues  |
| Epics (`.plan/epics/`)     | `bun run plan:docs`         | regenerates `.plan/epics-index.md` |
| Backlog (`.plan/backlog/`) | `bun run plan:backlog:sync` | backlog ↔ index                    |

`bun run plan:sync` only reconciles **tickets** — using it after an epic edit
leaves `epics-index.md` stale. Run the row that matches what you touched.

## 5. Plan-doc cross-staleness

After modifying a documentation or planning file, do minimal
cross-reconciliation in the same turn (do not batch into a later pass): grep
related directories for references (IDs, filenames, section names) that may
have gone stale. The tracked planning/doc paths all live under `.plan/`
(with a leading dot) and `docs/`:

- `docs/**/*.md`
- `.plan/**/*.md` (epics, tickets, backlog, matrix-*, epics-index)
- `notes/**/*.md`

Verify the patterns match the real path layout — a condition like `plan/…`
(without the leading dot) never fires for `.plan/…` files.

## 6. Worktree CLI must run from the repo root

The worktree CLI (`bun run scripts/worktree/ <cmd>`) resolves the main repo
root itself, but tree-mutating commands (`new`, `create`, `merge`, `rebase`,
`remove`, `cleanup`) are **rejected** when launched from inside a `tree/*`
worktree. Issue/ticket commands and read-only queries (list, status, branches,
show, search, issues) work from any checkout. Run worktree-layout operations
from the repo root.

## 7. Size-allow directive

`scripts/check-file-size.ts` gates files over the size limit. Per-file
exemptions use an inline `// size-allow: N` directive in the first 512-byte
header of the file. Prefer splitting a file into `index.ts` barrels over
adding an exemption. If an exemption outlives its file (file shrinks or is
deleted), remove the directive — stale exemptions pass silently.

## 8. Agent-output ANSI stripping

When the CLI is run by an agent harness (opencode/omp) or CI, ANSI color codes
are stripped from command output. Do not rely on color in output you parse
programmatically; treat colorized output as human-facing only.
