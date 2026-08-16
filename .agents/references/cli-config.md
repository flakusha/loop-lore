<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Development Commands & Configuration

Quick CLI reference for loop-lore. See `.agents/references/recommendations.md` for implementation guidance.

## Code Quality (Linting & Testing)

| Command                      | Description                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`               | ESLint (strict + unicorn + sonarjs)                                                                                                                                    |
| `bun run lint:css`           | Stylelint on source CSS                                                                                                                                                |
| `bun run lint:html`          | Markuplint on htmx/Alpine templates                                                                                                                                    |
| `bun run lint:html-scripts`  | Inline HTML script checks                                                                                                                                              |
| `bun run lint:chaining`      | Promise chaining checks                                                                                                                                                |
| `bun run lint:biome`         | Biome lint on docs/                                                                                                                                                    |
| `bun run md:lint`            | Markdownlint on docs/ + .plan/                                                                                                                                         |
| `bun run typecheck`          | TypeScript `tsc --noEmit`                                                                                                                                              |
| `bun run typecheck:frontend` | Frontend TypeScript check                                                                                                                                              |
| `bun run typecheck:coverage` | Type coverage (strict gate)                                                                                                                                            |
| `bun run format:dprint`      | dprint check                                                                                                                                                           |
| `bun run format:dprint:fix`  | dprint fmt                                                                                                                                                             |
| `bun run check`              | Parallel gate runner (`check-parallel.mjs`): typecheck ×4, lint (ts/css/html/html-scripts/chaining), dprint, md lint, db schema gate, size, context-weight, unit + e2e |
| `bun run check:report-ls`    | Aggregate per-worktree check reports (`.tmp/check-report.json`); flags stale (head mismatch)                                                                           |
| `bun run db:sync-types`      | Regenerate DB types from migrations                                                                                                                                    |
| `bun run db:sync-manifest`   | Regenerate schema manifest                                                                                                                                             |
| `bun run db:schemas:check`   | Verify generated schemas are current                                                                                                                                   |
| `bun run jscpd`              | Copy-paste detection (coarse)                                                                                                                                          |
| `bun run jscpd:full`         | Copy-paste detection (fine)                                                                                                                                            |
| `bun run size:check`         | File-size gate                                                                                                                                                         |
| `bun run context:weight`     | Agent context weight check                                                                                                                                             |
| `bun run plan:sync`          | Ticket index ↔ git issue sync check                                                                                                                                    |
| `bun run plan:sync:fix`      | Apply ticket index fixes                                                                                                                                               |
| `bun test`                   | Bun test runner (Jest-compatible)                                                                                                                                      |
| `bun test --coverage`        | Test coverage report                                                                                                                                                   |

## Configuration Files

| File                 | Purpose            |
| -------------------- | ------------------ |
| `eslint.config.mjs`  | Flat ESLint config |
| `dprint.json`        | Code formatting    |
| `biome.json`         | Docs linting       |
| `.markdownlint.json` | Markdown rules     |
| `.stylelintrc.json`  | CSS linting        |
| `.markuplintrc.json` | HTML linting       |

## Pre-commit Hook Setup

```bash
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit
```

Runs on commit: format → check → unit tests → e2e (with safeguards).

## Database

- **SQLite**: `bun:sqlite` native (no better-sqlite3)
- **Queries**: Kysely with bind parameters (never interpolation)
- **Migrations**: `src/db/migrations/`, Kysely Migrator
- **Migrations are source of truth**

## Running

| Command                 | Description      |
| ----------------------- | ---------------- |
| `bun run src/server.ts` | Dev server       |
| `bun run tui`           | Terminal UI      |
| `bun run build`         | Production build |

## Native Issue Tracking

| Command                                        | Description                                          |
| ---------------------------------------------- | ---------------------------------------------------- |
| `./scripts/worktree.sh ticket TYPE ID "Title"` | Create ticket + worktree (BUG/FIX/FEA/IDEA/TASK/SOL) |
| `./scripts/worktree.sh ticket ... --epic X`    | Link ticket to an epic                               |
| `./scripts/worktree.sh issues`                 | List open issues with branch mapping                 |
| `./scripts/worktree.sh state ID <state>`       | Transition issue status (open/in_progress/done)      |
| `./scripts/worktree.sh sync`                   | Interactive ticket-index ↔ git issue sync            |
| `./scripts/worktree.sh gi <args>`              | Run git-issue command directly                       |

### Extended Identifiers

| Type     | Prefix | Example       |
| -------- | ------ | ------------- |
| Bug      | BUG-   | BUG-2025-001  |
| Feature  | FEA-   | FEA-2025-042  |
| Fix      | FIX-   | FIX-2025-002  |
| Idea     | IDEA-  | IDEA-2025-023 |
| Task     | TASK-  | TASK-2025-007 |
| Solution | SOL-   | SOL-2025-001  |
| Epic     | EPIC-  | EPIC-16       |

## RTK Commands (Token-Efficient Output)

**Golden Rule**: Always prefix commands with `rtk`. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

Even in command chains with `&&`, use `rtk`:

```bash
rtk git add . && rtk git commit -m "msg" && rtk git push
```

### Build & Compile

```bash
rtk tsc         # TypeScript errors grouped by file
rtk lint        # ESLint violations grouped
rtk bun run build # Build output compressed
```

### Test

```bash
rtk bun test          # Failures only
rtk vitest            # Vitest failures only
rtk test <cmd>        # Generic test wrapper - failures only
```

### Git

```bash
rtk git status    # Compact status
rtk git log       # Compact log (works with all flags)
rtk git diff      # Compact diff
rtk git add       # Ultra-compact
rtk git commit    # Ultra-compact
```

### Files & Search

```bash
rtk ls <path>       # Tree format, compact
rtk find <pattern>  # Grouped by directory
```

### Meta Commands

```bash
rtk gain            # View token savings statistics
rtk proxy <cmd>     # Run command without filtering (debug)
```
