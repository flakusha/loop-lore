<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# AGENTS.md

Instructions for coding agents on loop-lore.

## Quick Start

```bash
# 1. Discover project structure
ls -la && cat package.json

# 2. Find relevant docs for your task
fd . docs/spec/ --type f | head -20
fd . docs/frontend/ --type f | head -20

# 3. Check existing code patterns
fd . src/ --type f -e ts | head -30

# 4. Verify changes
bun run check && bun test src/

# Coverage gate (new):
# - `bun run test:coverage` writes `.tmp/coverage/lcov.info`
# - `bun run scripts/check/coverage.mjs --floor=80` gates each module
# - Floor: 80% line coverage per module (no lower transitional floor)
# - New module tests must raise line coverage >= 80% to land (else waiver + ticket)
# - Generated artifacts (`.tmp/coverage/`) are scratchpad; never commit
#
# Check runner modes (`scripts/check-parallel.mjs`):
# - Heavy test gates (unit, e2e, coverage) always run serialized after the
#   light gates — two concurrent bun-test processes OOM on this host.
# - `bun run check --diff-base <ref>` scopes unit + coverage gates to the
#   branch diff (test files adjacent to changed src files; coverage floored
#   only for modules the diff touches). `worktree finalize` Step 2 passes
#   this automatically; static gates always run project-wide.
```

## Source of Truth (Precedence Order)

1. **`AGENTS.md`** — project conventions (this file)
2. **`.agents/references/banned-patterns.md`** + **`recommendations.md`** — review rules
3. **`src/`** — runnable truth, verify with `bun run check`
4. **`docs/spec/*`** — design specs (aspirational, may be stale)
5. **`docs/meta/code-practices-improvements/*`** — research only

⚠️ **Zod/TypeBox trap**: Specs describe Zod in `src/schemas/` — **does not exist**. Real stack: **Elysia `t` (TypeBox)** in `src/validation/schemas.ts`.

## Context Loading

Repo-local context in `.opencode/context/` takes precedence over global `~/.config/opencode/context/`.

| Context Type | Repo-Local (priority)                                  | Global (fallback)                                               |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| Tech stack   | `.opencode/context/project-intelligence/tech-stack.md` | `~/.config/opencode/context/project-intelligence/tech-stack.md` |
| Patterns     | `.opencode/context/project-intelligence/patterns.md`   | `~/.config/opencode/context/project-intelligence/patterns.md`   |
| Security     | `.opencode/context/project-intelligence/security.md`   | `~/.config/opencode/context/project-intelligence/security.md`   |
| Navigation   | `.opencode/context/core/navigation.md`                 | `~/.config/opencode/context/core/navigation.md`                 |

Budget profiles: `ultra_lean`, `lean`, `balanced` — see lean-ctx docs.

## Coding Conventions (Summary)

See **`.agents/references/recommendations.md`** for full patterns (options-object params, factory functions, discriminated unions, exhaustiveness checking, branded types, Result type, async hygiene, structured logging, input validation checklist).

Key rules in this file:

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One feature per file; <200 lines; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE constants
- **Async**: Always handle promises; no bare `.then()` chains
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services (use Kysely types)
- **Docs**: Avoid quantitative metrics in documents (commit counts, gate pass tallies, ticket counts, percentages) — they go stale fast and mislead. Use qualitative state ("push pending", "gate green") or recompute at write time; never paste a number captured earlier.
- **Tags**: Never create git tags (incl. release tags like `v0.1.0`) — tag creation is a post-testing decision reserved for the human. Agents prepare release artifacts (changelog, release-process docs) but stop at tagging.
- **Scratchpad & Tool Cache**: Temporary artifacts (debug tests, research notes, API probes, throwaway scripts) go in `.tmp/` (repo root) or `worktree/.tmp/` — never in `src/`, `tests/`, `docs/`, or repo root. `.tmp/` is auto-ignored by git; delete before merge. Include `.tmp/` paths in `ctx_handoff(paths=[...])` so the next session can pick them up. `.tmp/` is also the default cache for tooling output (check reports, Playwright artifacts, etc.).

## Scratchpad & Tool Cache (`.tmp/`)

### Agent scratchpad

Agents must not scatter temporary files across the repo (`src/`, `tests/`,
`docs/`, repo root). All scratch material lives in `.tmp/`:

- **Location**: `.tmp/` (repo root) or `worktree/.tmp/` (per-worktree)
- **Use**: Debug test files, research notes, API specs, interim findings, probe scripts — anything not meant for the committed tree
- **Rules**: Auto-ignored by git (no `.gitignore` edit needed); delete before finalize/merge; never import from `@/` aliases outside the repo root (module resolution breaks) — run debug scripts from inside `.tmp/` with relative imports or `bun --cwd`
- **Handoff**: Include `.tmp/` paths in `ctx_handoff(paths=[...])`; cleanup after merge

### Default cache for tooling

`.tmp/` is the default cache/output location for all project-local tooling that
produces transient artifacts. This keeps the repo root clean and avoids
scattered gitignore entries.

| Tool                  | Output          | Destination                                           |
| --------------------- | --------------- | ----------------------------------------------------- |
| `bun run check`       | check report    | `.tmp/check-report.json`                              |
| Playwright            | HTML report     | `.tmp/playwright-report/`                             |
| Playwright            | test artifacts  | `.tmp/test-results/`                                  |
| `bun test --coverage` | coverage report | `coverage/` (bun default — migrate when configurable) |

**Rule**: When configuring a new tool that writes transient output, point it at
`.tmp/<tool-name>/`. Only add root-level gitignore entries when the tool cannot
be configured otherwise (e.g. `bun test --coverage` → `coverage/`).

## Project Overview

Reimplement SillyTavern RPG chat:

- TUI (blessed) + Web UI (htmx + Alpine.js)
- DB: `bun:sqlite` → Kysely (PG via dialect swap)
- Assets (images/audio/video) — polymorphic linking
- Enhanced assistant, user mgmt, multi-session
- VN scene generation with choice cards
- Emotion avatars with multi-provider text2img fallback
- Regex extraction pipeline (image edits, intents, memory, transitions, etc.)
- Tests covering services, routes, middleware, crypto, RPG systems

## Technology Constraints

| Layer    | Required                  |
| -------- | ------------------------- |
| Runtime  | Bun (`bun run` directly)  |
| Language | TypeScript 5.4+ strict    |
| Database | `bun:sqlite` + Kysely     |
| TUI      | blessed + blessed-contrib |
| Web      | htmx + Alpine.js          |

## Discovery Commands

```bash
# Find specs by topic
fd "rpg\|combat\|item" docs/spec/ --type f
fd "chat\|message" docs/frontend/ --type f

# Find code by pattern
rg "class.*Service" src/ --type ts
rg "interface.*Config" src/ --type ts

# Find tests
fd "test" src/ --type f -e ts

# Check git issues for active work
bun run scripts/worktree/ issues
bun run scripts/worktree/ search "your topic"
```

## Directory Structure (Key Paths)

```
src/
├── elysia-app.ts        # Elysia setup
├── server/              # HTTP entry (handler, index, start, static-files)
├── db/                  # Kysely + schema (migrations are source of truth)
├── config/              # Config loading
├── routes/              # REST handlers
├── generation/          # LLM generation + hooks
├── story/               # Multi-LLM story
├── turning/             # Turn orchestration
├── chat/                # Chat service layer (context window, transitions, moderation)
├── crypto/              # Encryption
├── eslint-rules/        # Custom ESLint rules (param-limit)
├── frontend/            # Bundled htmx + Alpine.js
├── views/               # htmx templates (server-rendered)
├── public/              # Static assets served at / (CSS, locales)
├── plugins/             # Plugin system
├── tui/                 # Blessed widgets
├── regex/               # Extraction pipeline (image edits, intents, memory, etc.)
├── rpg/                 # RPG subsystems (combat, quests, skills, loot, etc.)
├── scripts/             # Build scripts (commit-check, smoke-app, version-bump)
├── characters/          # Character services (avatar, mood, traits, relationships)
├── assets/              # Asset service + metadata extraction
├── memory/              # Memory budget, provisioning, purge, decay
├── i18n/                # Internationalization (server + frontend)
├── group-chat/          # Group chat mention parsing
├── assistant/           # Rule-based assistant + commands + prompt assembly
├── admin/               # Admin config, provider health
├── middleware/          # Auth, NSFW gate, solo user, rate limit, i18n
├── auth/                # Authentication + sessions
├── nsfw/                # NSFW gate + moderation service
├── transport/           # WebSocket transport layer
├── content/             # Hash injection, compression, encoding
├── personas/            # Persona service
├── notifications/       # Notification service
├── profanity/           # Profanity filter
├── age-gate/            # Age gate service
├── app/                 # Plugin registration (register-plugins.ts)
├── telemetry/           # Telemetry
├── aux-pipeline/        # Auxiliary LLM pipeline
├── battle/              # Battle/RPG combat UI glue
├── image-edit/          # Image editing
├── logger/              # Structured logging
├── schemas/             # Generated/config schemas
├── services/            # Cross-cutting services
├── components/          # Shared UI components
├── partials/            # htmx partials
├── prompts/             # Prompt templates
├── build/               # Build-time helpers (compress, copy-icons)
├── test-utils/          # Test insert helpers
├── validation/          # Elysia t (TypeBox) schemas + middleware
└── utils/               # Shared utilities

docs/spec/               # Core specs
docs/frontend/           # UX specs
.plan/                   # Task tracking (source of truth)
```

## Anti-Patterns (Enforced in Review)

See `.agents/references/banned-patterns.md` — reject these:

- `any` type, boolean flags, numeric statuses
- Bare `.then()`, silent catches, `void promise` without `.catch()`
- `console.*` instead of logger, missing ownership checks
- AI SDK wrappers, CSS-in-JS, `I` prefix on interfaces

## Patterns (Enforced in Review)

See `.agents/references/recommendations.md` — use these:

- Structured logging, input validation checklist
- Safe JSON IIFE, options-object params
- Discriminated unions, exhaustiveness checking
- Branded types, state machines, factory functions

## Verification Gates (Required Before "Done")

```bash
bun run check        # parallel gate runner (check-parallel.mjs): typecheck ×4, lint (ts/css/html/html-scripts/chaining), dprint, md lint, db schema gate, size, context-weight, unit + e2e tests
bun run check:report-ls  # aggregate check reports across all worktrees (flags stale)
bun test src/        # unit tests
E2E_SAFEGUARD=1 bun test tests/e2e/  # e2e (if affecting)
```

Each `bun run check` writes `.tmp/check-report.json` atomically with provenance
(branch, gitHead, runId, mode). The pre-commit hook warns when the report is
stale w.r.t. the tree's current HEAD; treat a stale or failed report as
"unverified". `bun run check:report-ls` (or `bun run scripts/worktree/ report`)
aggregates report status across all worktrees.

### Check report stdout contract (programmatic consumption)

The runner emits machine-greppable lines on stdout for downstream tooling:

```
CHECK_REPORT_PATH=/abs/path/.tmp/check-report.json
CHECK_REPORT_LATEST=/abs/path/.tmp/check-report.latest.json
CHECK_REPORT_RUN_ID=<pid>-<base36-time>
```

`grep ^CHECK_REPORT_` extracts the facts; `CHECK_REPORT_PATH=$(...)` captures
the canonical (latest) path. The canonical file is the same content as the
per-run file at any moment — a stable target for tools that don't track
`RUN_ID`. `.latest.json` is a symlink to the most recent per-run file; it's
atomic-rotated so consumers never see a dangling pointer.

### Check report retention

Per-run files live at `.tmp/check-report-<RUN_ID>.json`. The runner keeps the
most recent `REPORT_RETENTION_COUNT = 20` and prunes older entries on each new
run. ~200KB per report × 20 = ~4MB worst-case disk footprint per worktree.
`check:report-ls` shows the current kept-count in the `kept` column.

Concurrent runs in the same worktree each get a unique `RUN_ID`; both per-run
files survive, and the canonical `check-report.json` reflects the last writer.
No torn writes — atomic temp + rename on every step.

### DB schema migrations — parts/ layout & workflow

`up(db)`/`down(db)`, orchestrated by `001_init.ts` (runs `up()` in part order,
`down()` in reverse). `src/db/migrate.ts` runs them via Kysely's `Migrator`
with an `assertMigrationsNotStale` guard that fails fast on deleted/renamed/
renumbered migrations. The migration chain is covered by
`src/db/migrations.test.ts` and `src/db/migration-roundtrip.test.ts`
(up→down→up consistency).

**Append-only policy** — applied migrations are never deleted, renamed, or
renumbered (the filename is the identity stored in `kysely_migration`). To
change schema behavior, add a **new forward migration** that alters the schema
to the desired state. Full policy: `src/db/migrations/README.md`.

**Before implementing any migration change, request the user's DB migration
strategy — append (new `parts/NNN_*.ts`) vs. fold (extend an existing part)** —
and proceed only after the decision. This is a mandatory pre-implementation
step; extend a shipped part only when the new state hasn't been released.

All downstream schema artifacts are **auto-generated** from migrations and must
be regenerated on any migration add/edit. The `check` gate (`schemas:check`)
fails red until they are:

```bash
# Regenerate after a migration change:
bun run db:sync-types && bun run db:sync-manifest
# Verify the gate is green:
bun run schemas:check
# Verify the migration chain + roundtrip:
bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts
```

Generated (never hand-edit): `src/db/schema-*.ts`, `src/db/schema.ts`,
`src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`,
`src/validation/db-schemas.ts`. e2e provisioning and unit tests build the
schema directly from migrations, so they pick changes up automatically.

Migration helper utilities:

- `src/db/migration-helpers.ts` — `boolToEnum`/`batchBoolToEnum` for
  boolean → text-enum column conversions (transactional; logs non-0/1 values).
- `src/db/column-types.ts` — maps `table.column` → TS enum type for generated
  schemas; update here when adding a text-enum column that needs a typed type.
- One `ADD COLUMN` / `DROP COLUMN` per `alterTable` statement (SQLite
  limitation) — see `src/db/migrations/README.md`.

## Worktree Workflow

```bash
# Create worktree
bun run scripts/worktree/ new feature-name

# Work in worktree
cd tree/feature-name

# Agent commit (GPG-signed)
bun run scripts/worktree/ agent-commit feature-name "feat(scope): message"

# Rebase onto updated dev
bun run scripts/worktree/ rebase feature-name

# Finalize (checks + signed merge + cleanup; --force skips gates)
bun run scripts/worktree/ finalize feature-name
```

> **Note:** The worktree CLI is native Bun (`scripts/worktree/index.mjs`). Run via `bun run scripts/worktree/ <command>` — no shell wrapper.

### Mutating operations are worktree-only

Agents MUST NOT run `git commit`, `git stash`, `git reset`, `git rebase`,
`git merge`, `git push`, or any other mutating git command directly on
`/home/flak/git-ai/loop-lore` (the dev checkout) outside of an isolated
worktree under `tree/`. The dev checkout is for read-only inspection.
All mutating operations — commits, stashes, rebases, merges, push/cleanup
of finalized branches — flow through `scripts/worktree/`. If
`scripts/worktree/ <command>` fails, agents MUST stop and report the failure
to the user instead of bypassing the tooling with direct `git` calls.

### GPG signing — never bypass

If `git commit`, `scripts/worktree/ agent-commit`, or any signed operation
fails with a GPG / pinentry error, agents MUST stop and report the failure.
NEVER set `commit.gpgsign=false`, pass `-S none`, or otherwise strip the
signature requirement. The user owns GPG configuration; agents report, the
user fixes the signer. An unsigned commit on `dev` is a blocker — reset it
and ask the user to re-sign or re-run the flow.

### Stop on tooling failure

When a `scripts/worktree/` command (or any other tool) fails, agents MUST
stop and surface the error. Do NOT retry the failing step with a workaround
(different binary, force flag, raw git, manual signing, etc.) without
explicit user direction. If a workaround is genuinely necessary, ASK first.

### Finalize signal safety + manual recovery

`finalize` installs SIGINT/SIGTERM/SIGHUP handlers around the in-place merge
on `dev`. On signal, it runs a transactional rollback in order: `git merge
--abort`, then pop the auto-stashed dev state, then release the lock, then
`exit 130`.

`kill -9` (SIGKILL) bypasses the handler and may leave dev mid-merge. Recover
manually:

```bash
bun run scripts/worktree/ abort              # recover (idempotent)
bun run scripts/worktree/ abort --dry-run   # preview what would happen
```

`abort` aborts any in-progress merge/rebase/cherry-pick, pops leftover
`worktree-finalize-*` stashes (preserving them if pop conflicts), and removes
a stale lockfile. It NEVER deletes user-authored stashes, force-deletes
branches, or resets to a remote ref.

````
## Issue Tracking

```bash
# Create ticket (filename = TYPE-slug from title, e.g. TASK-fix-login; also creates git issue)
bun run scripts/worktree/ ticket TASK "Title" "Description" -l label -p high

# List/Search
bun run scripts/worktree/ issues
bun run scripts/worktree/ search "pattern"

# Show/Comment/Attach
bun run scripts/worktree/ show TASK-001
bun run scripts/worktree/ comment TASK-001 -m "text"
bun run scripts/worktree/ attach TASK-001 ./file.md

# State transitions
bun run scripts/worktree/ state TASK-001 closed

# Sync .plan/tickets/index.json with git issues
bun run plan:sync:fix                 # apply fixes (non-interactive)
bun run plan:sync                     # check
bun run plan:sync:fix                 # apply fixes

# Direct git-issue
bun run scripts/worktree/ gi <command>
````

## Planning System

- **`.plan/epics/`** — epic definitions (includes merged design/roadmaps/ideas/research/features content)
- **`.plan/tickets/`** — task tickets
- **`.plan/epics-index.md`** — consolidated epic status (auto-generated from `.plan/epics/`)
- **`.plan/backlog/`** — priority workstack and open/deferred items

**`.plan/` is source of truth**; `docs/meta/` is reference only.

`.plan/` docs follow the same no-volatile-metrics rule as all docs: capture
state qualitatively ("wired", "push pending") and recompute numbers at write
time. Do not paste commit counts, ahead/behind tallies, or pass tallies that
were captured in an earlier session — they are stale by definition.

## Memory (Engram)

```bash
# Save decision/fix/pattern
engram mem_save --title "Fixed X" --type bugfix --content "**What**: ... **Why**: ... **Where**: ... **Learned**: ..."

# Search past work
engram mem_search "query"

# Session summary (MANDATORY before done)
engram mem_session_summary --content "## Goal... ## Discoveries... ## Accomplished... ## Next Steps... ## Relevant Files..."
```
