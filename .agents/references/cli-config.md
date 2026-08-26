<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Development Commands & Configuration

Quick CLI reference for loop-lore. See `.agents/references/recommendations.md` for implementation guidance.

## Code Quality (Linting & Testing)

| Command                      | Description                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`               | ESLint (strict + unicorn + sonarjs)                                                                                                                                    |
| `bun run lint:oxlint:advisory` | oxlint advisory pass (tsc + eslint cover real correctness)                                                                                                          |
| `bun run lint:biome`         | Biome lint on docs/                                                                                                                                                    |
| `bun run md:lint`            | Markdownlint on docs/ + .plan/                                                                                                                                         |
| `bun run typecheck`          | TypeScript `tsc --noEmit`                                                                                                                                              |
| `bun run typecheck:frontend` | Frontend TypeScript check                                                                                                                                              |
| `bun run typecheck:coverage` | Type coverage (strict gate)                                                                                                                                            |
| `bun run format`             | dprint check                                                                                                                                                           |
| `bun run format:fix`         | dprint fmt                                                                                                                                                             |
| `bun run check`              | Parallel gate runner (`check-parallel.mjs`): typecheck ×4, lint (ts/eslint/biome), dprint, md lint, db schema gate, size, context-weight, unit + e2e |
| `bun run check:report-ls`    | Aggregate per-worktree check reports (`.tmp/check-report.json`); flags stale (head mismatch)                                                                           |
| `bun run db:sync-types`      | Regenerate DB types from migrations                                                                                                                                    |
| `bun run db:sync-manifest`   | Regenerate schema manifest                                                                                                                                             |
| `bun run schemas:check`      | Verify generated schemas are current (`db:schemas:check` does not exist)                                                                                              |
| `bun run jscpd`              | Copy-paste detection (coarse)                                                                                                                                          |
| `bun run jscpd:full`         | Copy-paste detection (fine)                                                                                                                                            |
| `bun run size:check`         | File-size gate                                                                                                                                                         |
| `bun run context:weight`     | Agent context weight check                                                                                                                                             |
| `bun run plan:sync`          | Ticket index ↔ git issue sync check                                                                                                                                    |
| `bun run plan:sync:fix`      | Apply ticket index fixes (`scripts/sync-ticket-index.ts --fix`)                                                                                                        |
| `bun test`                   | Bun test runner (Jest-compatible)                                                                                                                                      |
| `bun test --coverage`        | Test coverage report                                                                                                                                                   |

## Configuration Files

| File                 | Purpose            |
| -------------------- | ------------------ |
| `eslint.config.mjs`  | Flat ESLint config |
| `dprint.json`        | Code formatting    |
| `biome.json`         | Docs linting       |
| `.markdownlint.json` | Markdown rules     |

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
- After any migration change: `bun run db:sync-types && bun run db:sync-manifest`, then `bun run schemas:check`

## Running

| Command                 | Description      |
| ----------------------- | ---------------- |
| `bun run dev`           | Dev server (watch) — `build:frontend` then `bun --watch src/server/index.ts` |
| `bun run start`         | Dev server (no watch) — `bun run src/server/index.ts`                        |
| `bun run tui`           | Terminal UI      |
| `bun run build`         | Production build |

## Native Issue Tracking

All commands run via `bun run scripts/worktree/ <command>`. Valid ticket types:
`BUG-`, `FEAT-`, `FIX-`, `IDEA-`, `TASK-`, `SOL-`, `INFRA-` (there is no `FEA-`
type and epics are not tickets — they live in `.plan/epics/`).

| Command                                          | Description                                          |
| ------------------------------------------------ | ---------------------------------------------------- |
| `bun run scripts/worktree/ ticket BUG ID "Title"` | Create ticket file + git issue (BUG/FEAT/FIX/IDEA/TASK/SOL/INFRA) |
| `bun run scripts/worktree/ issues`               | List open issues with branch mapping                 |
| `bun run scripts/worktree/ state ID closed`      | Transition issue status (`open` \| `closed`)         |
| `bun run plan:sync`                              | Dry-run ticket-index ↔ git issue sync               |
| `bun run plan:sync:fix`                          | Apply sync fixes (non-interactive)                   |
| `bun run scripts/worktree/ gi <args>`            | Run git-issue command directly                       |
