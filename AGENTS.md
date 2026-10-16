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
# - Heavy test gates (e2e, coverage, plan-sync, eslint) always run serialized
#   after the light gates, in an `await` loop that never reads the concurrency
#   cap — so no `--jobs` value can start two bun-test processes.
# - Gate concurrency defaults to 4, and it bounds the light pool only. The
#   default was raised from 1 after measuring a real finalize at JOBS=1: peak
#   11.93 GB total / 2.79 GB single process on 52.3 GiB available, while the
#   light pool's four heaviest gates at jobs=4 sum to ~9.4 GiB — less than
#   JOBS=1 already reached. It buys headroom symmetry, not wall time: the run
#   is dominated by the serialized heavy tail. Pass `--jobs N` (or
#   `CHECK_JOBS=N`) to change it, and drop to 1 when a finalize would run
#   beside two other finalizations.
# - `bun run check --diff-base <ref>` scopes the COVERAGE gate to the diff
#   between `<ref>` and HEAD, plus uncommitted working-tree changes: each
#   diff-touched `src/` file is floored individually against a test run covering
#   the modules it lives in. No other gate is scoped (the registry has no
#   `test - unit` entry). A file holding identical content on both sides is NOT
#   scoped in, even when the branch edited it earlier and `<ref>` has since
#   reproduced the same content — landing the branch would not change it. The
#   list is a superset of the merge, never a subset: rename-only and mode-only
#   changes are still listed, and only TRACKED worktree changes are seen, so an
#   untracked new file is not gated. `giwt finalize` Step 2 passes the ref
#   automatically; static gates always run project-wide.
# - `bun run check --gates <csv>` / `--skip-gates <csv>` runs a subset of
#   the registered gates. Names are matched verbatim against the runner's check
#   registry; unknown names exit 2 and list available gates. `--gates`
#   and `--skip-gates` are mutually exclusive. `giwt finalize`
#   accepts `--gates` / `--skip-gates` and forwards them to Step 2.
# - Advisory gates (ADVISORY_GATES in scripts/check/parallel/gates.mjs) RUN
#   and REPORT like any other gate, but a failure does NOT fail the run.
#   They are generated-artifact freshness checks that drift from concurrent
#   dev-side merges and are reconciled post-merge anyway. The failure is
#   still visible in the report as ADVISORY, so the signal is not lost —
#   it just does not block finalization.
```

### Weave-damage scan (post-rebase)

`giwt rebase` resolves conflicts with the weave, which can silently **drop**
code blocks: the file stays syntactically valid, so typecheck and lint stay
green and only the unit suite notices. After any weave-driven rebase:

```bash
WEAVE_BASE=<pre-rebase-sha> bun run check --gates "weave - damage scan"
git diff <pre-rebase-sha> -- <auto-resolved-file>   # expect only intended changes
```

The gate is a no-op unless `WEAVE_BASE` is set, so normal runs are unaffected.

## Source of Truth (Precedence Order)

1. **`AGENTS.md`** — project conventions (this file)
2. **`.agents/references/banned-patterns.md`** + **`recommendations.md`** — review rules; **`.agents/skills/giwt-usage/SKILL.md`** — giwt command reference
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
- **Files**: One feature per file; <200 lines; 250L is the DEFAULT line budget, not a hard ceiling — `giwt plan check-file-size` (aliased as `bun run size`) warns and exits 0 by default; it exits 1 (the actual gate) solely under `--strict`, which scans `src/`, `scripts/` and `plugins/` for `*.ts`/`*.mjs` only; `// size-allow: N` in a file's first 512 chars REPLACES its budget with any N, uncapped in both directions — keep it as small as the file needs, for cohesive single-purpose files only; `*.test.*`, `/migrations/` and files carrying a `DO NOT EDIT MANUALLY` banner are exempt; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE constants
- **Async**: Always handle promises; no bare `.then()` chains
- **JSDoc**: Minimal. `@throws` REQUIRED on any function whose body throws, returns `Result.err`, or rejects a Promise — JS has no throw-signal via types, so JSDoc is the only LSP/AST-visible signal for error paths. `@param`/`@returns` only when non-obvious from signature (omit when type suffices). Keep blocks ≤3 lines; no `@example`, no multi-paragraph descriptions. Generated files (`src/db/schema*.ts`, `src/db/schema.ts`, `src/validation/db-schemas.ts`, `src/test-utils/insert-helpers.ts`) are exempt — regenerated by `bun run db:sync-*`.
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
- **Enforcement**: `giwt finalize` now prunes a worktree's scratchpad at Step 6a,
  immediately before removing the worktree, so "delete before finalize" is no
  longer advisory. It only prunes the four scanner classes (`*.tmp` files older
  than `tmpMaxAgeDays`, `lcov.*.tmp` files anywhere under root (age-independent),
  all but the newest `lcovKeepLatest` `cov-*` directories by mtime, `jscpd-report.json`
  files older than `jscpdMaxAgeDays`, and root-level `check-report*.json` past the
  newest `checkReportKeep`) — research notes, probe scripts and anything else are
  unclassified and preserved. Two consequences for handoff: do not rely on
  `cov-*` or `check-report*.json` under a worktree `.tmp/` surviving the
  finalize of that worktree, and note that `giwt finalize --dry-run` reports
  the prune plan without deleting anything (the merge, worktree removal and
  branch delete still run).
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

LLM RPG chat platform (SillyTavern-inspired, not a reimplementation):

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
giwt issues
giwt search "your topic"
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
├── eslint-rules/        # Custom ESLint rules (options-object-params)
├── frontend/            # Bundled htmx + Alpine.js
├── views/               # htmx templates (server-rendered)
├── public/              # Static assets served at / (CSS, locales)
├── plugins/             # Plugin system
├── tui/                 # Blessed widgets
├── regex/               # Extraction pipeline (image edits, intents, memory, etc.)
├── rpg/                 # RPG subsystems (combat, quests, skills, loot, etc.)
├── scripts/             # loop-lore-specific check/build scripts (giwt handles worktree ops)
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
bun run check        # parallel gate runner (check-parallel.mjs): typecheck ×5, lint (ts/css/html/html-scripts/chaining), dprint, md lint, db schema gate, conflict markers, size, context-weight, i18n reconcile, jscpd ratchet, unit + e2e tests
#                     # `jscpd ratchet` is ADVISORY (see ADVISORY_GATES in
#                     # scripts/check/parallel/gates.mjs): it runs and reports like any
#                     # other gate, but a clone count past scripts/check/jscpd-baseline.json
#                     # shows as ADVISORY in the summary without failing the run
bun run check:report-ls  # aggregate check reports across all worktrees (flags stale)
bun test src/        # unit tests
E2E_SAFEGUARD=1 bun test tests/e2e/  # e2e (if affecting)
```

Each `bun run check` writes `.tmp/check-report.json` atomically with provenance
(branch, gitHead, runId, mode). The pre-commit hook warns when the report is
stale w.r.t. the tree's current HEAD; treat a stale or failed report as
"unverified". `bun run check:report-ls` (or `giwt report`)
aggregates report status across all worktrees.

A gate that could not be evaluated is reported as **skipped**, not failed:
`summary.skipped` and the per-check `skipped` flag carry the count, and
`--report-ls` renders those rows as `pass (N skipped)`. The plan gates skip
when giwt cannot reach the git issue CLI — that state is never a pass and never
a red gate with the phantom findings giwt emits in that mode.

A failing gate also prints `Full output: <path>`, pointing at
`.tmp/run-<RUN_ID>/check-fail-<slug>.log` — the untruncated output of that
one check. The console excerpt keeps only head-5 + tail-20 lines, which for a
long gate (the e2e browser suite is 35 files) discards exactly where the
failing assertion lives. **When a gate is red and the printed output does not
explain why, read that file rather than re-running** — the per-run retention
pass prunes it.

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

### DB schema migrations

Top-level `NNN_name.ts` files under `src/db/migrations/`, each exporting `up(db)` and `down(db)`. Auto-discovered by `getMigrationFiles()` in `src/db/migrate.ts` via filename. The migration chain is covered by `src/db/migrations.test.ts` and `src/db/migration-roundtrip.test.ts` (up→down→up consistency).

**Append-only policy** — applied migrations are never deleted, renamed, or renumbered (the filename is the identity stored in `kysely_migration`). To change schema behavior, add a **new forward migration** that alters the schema to the desired state. Full policy: `src/db/migrations/README.md`.

**Two paths for new schema changes:** (1) append a new top-level `NNN_*.ts` migration (default — numbering is sequential from `001_init`, so the next file is `002_*`; old pre-collapse numbers are dead, do not skip ahead); (2) extend the current HEAD migration if it is not yet shipped. There is no `parts/` subdirectory, no folding into a frozen base migration.
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

`giwt` is the canonical worktree, ticket, and git-issue CLI. It is installed
via the project's `giwt` git dependency (see `docs/giwt-scripts-map.md`) and
linked at `~/.local/bin/giwt`. **Use `giwt <command>` for every worktree
operation** — do not run raw `git worktree`/`git commit`/`git merge`/`git push`
on the dev checkout.

> **Version pin**: the `~/.local/bin/giwt` symlink points at a _mutable local
> checkout_ of giwt, so a bare `giwt` may run a different commit than the repo
> depends on. Prefer the pinned copy: `bun run <script>` (bun puts
> `node_modules/.bin` ahead of `~/.local/bin`, so the `plan:*` scripts already
> resolve the pin), or `bun node_modules/giwt/src/cli.ts <args>`. Repo code
> that shells out to giwt MUST spawn the pinned path, not the bare name.
> The dependency itself is pinned by `bun.lock` (`github:flakusha/giwt`).
>
> Raw `git` invocations in bash may be rerouted by the harness to `giwt git` —
> a safety-gated passthrough that refuses destructive shapes, GPG bypass, and
> config writes (config: `git` section of `giwt.toml`). Full command map and
> lifecycle reference: `.agents/skills/giwt-usage/SKILL.md`.

```bash
# Create worktree (branch defaults to dev base)
giwt new feature-name [--scope <text>] [--tickets <csv>]

# Work in worktree
cd tree/feature-name

# Commit in worktree (GPG-signed; --message-file for multi-line)
giwt commit-wt feature-name "feat(scope): message"

# Rebase onto updated dev
giwt rebase feature-name

# Finalize (checks + signed merge + cleanup; --force skips gates)
giwt finalize feature-name [--gates <csv>] [--skip-gates <csv>]
# Plan-only branches (tickets/epics/backlog/index + generated matrix/code-map):
# prefer squash — one merge instead of a per-commit rebase replay:
giwt finalize plan-branch --merge-strategy squash

# Manual recovery if finalize left dev in a bad state
giwt abort              # recover (idempotent)
giwt abort --dry-run   # preview what would happen

# Other frequently used commands (full map: .agents/skills/giwt-usage/SKILL.md)
giwt finalize feature-name --plan-gates <csv> --jobs <n>  # gate tuning
giwt remove feature-name [--branch-only]  # drop worktree/branch
giwt cleanup                              # prune worktrees of deleted branches
giwt create feature-name                  # worktree for existing branch
giwt prs                                  # worktrees for open PRs
giwt report        # aggregate check reports (same as bun run check:report-ls)
giwt report --profile [--since <iso>] [--json]  # cross-worktree gate failure + duration table
giwt runs [triage <run> | diff <a> <b>]   # run records + failure triage
giwt ledger [--last N] [--json]           # shared agent ledger
giwt gripe --at <branch> <message>        # flag a failure at another branch
giwt doctor [check | scratchpad]          # repo health / scratchpad bloat
giwt clean ; giwt tmp                     # .tmp / machine-temp pruning (dry-run default)
giwt docs list|show|search|dump           # markdown doc corpus
giwt task "<directive>" -w                # render an agent task prompt
```

> **Note**: `giwt` is the canonical CLI — all worktree work goes through it.
> The in-repo `scripts/worktree/` CLI has been **deleted**; `giwt` is the only
> entry point, with no thin shim left behind. Two consequences worth knowing:
> `scripts/check/parallel/gpg.mjs` reaches giwt's gpg helpers by deep path
> (`node_modules/giwt/src/utils/gpg-cache`) — `warmAgentCache` is now public
> upstream and the inline duplicates were dropped.
> CLI directly — is gone, so `giwt finalize` has no coverage in this repo's
> `bun test` (which excludes `node_modules`).
>
> The canonical implementation is `giwt` from the pinned git dependency. `giwt`
> carries features the fork lacked: Step 5.5 scoped-worktree reconciliation,
> the FIFO finalize lock queue, `--jobs`, and `--gates`/`--skip-gates`/`--plan-gates`.
>
> Flag-style differences worth noting:
> `giwt ticket` uses `--label` / `--priority` (long-form), not `-l` / `-p`;
> `giwt commit-wt` is the renamed `commit-branch`; `giwt merge` takes
> `<target-branch> <source>` instead of the legacy `<base> <feature>`.

### Mutating operations are worktree-only

Agents MUST NOT run `git commit`, `git stash`, `git reset`, `git rebase`,
`git merge`, `git push`, or any other mutating git command directly on
`/home/flak/git-ai/loop-lore` (the dev checkout) outside of an isolated
worktree under `tree/`. The dev checkout is for read-only inspection.
All mutating operations — commits, stashes, rebases, merges, push/cleanup
of finalized branches — flow through `giwt`. If a `giwt <command>` fails,
agents MUST stop and report the failure to the user instead of bypassing
the tooling with direct `git` calls.

### GPG signing — never bypass

If `giwt commit-wt`, `giwt finalize`, or any signed operation fails with a
GPG / pinentry error, agents MUST stop and report the failure. NEVER set
`commit.gpgsign=false`, pass `-S none`, or otherwise strip the signature
requirement. The user owns GPG configuration; agents report, the user fixes
the signer. An unsigned commit on `dev` is a blocker — reset it and ask the
user to re-sign or re-run the flow. Warm the cache with `giwt gpg-unlock`
before any signing run if `gpg-agent` is cold.

### Stop on tooling failure

When a `giwt` command (or any other tool) fails, agents MUST stop and
surface the error. Do NOT retry the failing step with a workaround
(different binary, force flag, raw git, manual signing, etc.) without
explicit user direction. If a workaround is genuinely necessary, ASK first.

### Finalize signal safety + manual recovery

`giwt finalize` installs SIGINT/SIGTERM/SIGHUP handlers around the in-place
merge on `dev`. On signal, it runs a transactional rollback in order:
`git merge --abort`, then pop the auto-stashed dev state, then release the
lock, then `exit 130`.

`kill -9` (SIGKILL) bypasses the handler and may leave dev mid-merge.
Recover manually with `giwt abort` (see above).

`giwt abort` aborts any in-progress merge/rebase/cherry-pick (and clears an
orphan `REBASE_HEAD` left by a SIGKILL), pops leftover `worktree-finalize-*`
stashes, and removes a stale lockfile. It NEVER deletes user-authored
stashes, NEVER runs `git reset --hard`, never force-deletes branches, and
never resets to a remote ref. A stash that only _mentions_ the prefix is
reported and left untouched; a pop that fails or conflicts STOPS the recovery
(exit 1) with the stash preserved and the conflicted paths printed. A pop
onto a clean tree applies the whole snapshot and drops the entry — inspect
first with `giwt abort --dry-run` or `git stash show -p`, especially when the
dev checkout may hold other agents' work; the printed dropped sha can be
undone with `git stash apply <sha>`.

````
## Issue Tracking

```bash
# Create ticket (filename = TYPE-slug from title, e.g. TASK-fix-login; also creates git issue)
giwt ticket TASK "Title" "Description" --label label --priority high

# List/Search
giwt issues
giwt search "pattern"

# Show/Comment/Attach
giwt show TASK-001
giwt comment TASK-001 -m "text"
giwt attach TASK-001 ./file.md

# State transitions
giwt state TASK-001 closed

# Sync .plan/tickets/index.json with git issues
bun run plan:sync:fix                 # apply fixes (non-interactive) — runs giwt sync --fix
bun run plan:sync                     # check — runs giwt sync

# Comprehensive .plan/ validation (format, linkage, backlog, tickets, code-map,
# links, spdx, naming, epics-doc, status-vocab, matrix)
bun run plan:validate                 # check — exits non-zero on findings
bun run plan:validate:fix             # apply auto-fixable findings (giwt plan validate --fix)
bun run plan:status                   # health summary (open/closed counts, gate pass/fail)

# Backlog index reconciliation (.plan/backlog/ index rows ↔ tier files)
bun run plan:backlog:sync             # check — exits non-zero on orphans/phantoms/outside rows
bun run plan:backlog:sync:fix         # add orphans, drop phantoms

# Feature matrix (.plan/feature-matrix.md, generated from the ticket index)
bun run plan:matrix                   # regenerate
bun run plan:matrix:check             # freshness gate — committed matrix vs fresh rebuild

# Direct git-issue
giwt gi <command>
````

## Planning System

- **`.plan/epics/`** — epic definitions (includes merged design/roadmaps/ideas/research/features content)
- **`.plan/tickets/`** — task tickets
- **`.plan/epics-index.md`** — consolidated epic status (auto-generated from `.plan/epics/`)
- **`.plan/backlog/`** — priority workstack and open/deferred items
- **`.plan/feature-matrix.md`** — feature matrix generated from the ticket index (auto-generated)

**`.plan/` is source of truth**; `docs/meta/` is reference only.

`.plan/` docs follow the same no-volatile-metrics rule as all docs: capture
state qualitatively ("wired", "push pending") and recompute numbers at write
time. Do not paste commit counts, ahead/behind tallies, or pass tallies that
were captured in an earlier session — they are stale by definition.

### Ticket status vocabulary

`plan validate`'s `status-vocab` gate rejects any `**Status:**` value outside
the canonical set: **Not Started**, **In Progress**, **Blocked**, **Done**,
**Wontfix**, **Postponed**. Type it bare — an emoji prefix (`⬜ Not Started`)
fails the gate, as does any invented variant. Extra freeform values map onto
canonical ones via `[status.aliases]` in `giwt.toml`.

Prefer `giwt ticket` / `giwt state` over hand-writing ticket `.md` files: the
generator emits the exact `**Field:**` lines the `format` gate requires.

### Ticket ↔ scratch-task granularity (task-management)

Two trackers coexist; pick ONE primary per piece of work — never duplicate state.

- `.plan/tickets/*.md` (git-tracked, epic-bound, gated by `plan validate`): the
  WHAT and the build ledger. Cross-session work, anything epic-bound, anything
  an operator must see.
- `.tmp/tasks/{slug}/` (`task.json` + `subtask_*.json`, scratchpad, gitignored):
  the HOW for one session — fine-grained subtasks with `depends_on`,
  `acceptance_criteria`, `deliverables`. Schema is owned by the user-level
  `task-management` skill (`~/.config/opencode/skills/task-management/`).

- Rule of thumb: ticket = what to build; task = how to build it this session.
- FEAT/TASK work spanning more than 3 steps → decompose into `.tmp/tasks/`
  first; the ticket stays the ledger and is updated as subtasks land.
- BUG fixes are single-fix by default — no scratch-task breakdown unless the
  fix spans more than 3 files.
- Cross-reference one way only: `task.json` `context_files`/`reference_files`
  name the ticket path; never put `.tmp/tasks/` slugs into a ticket's
  `**Related:**` (refs there must resolve to plan files).
- Lifecycle: ticket Not Started → (decompose) → In Progress → subtasks
  `pending` → `in_progress` → `completed` (via the CLI `complete`, with a
  summary) → feature `exit_criteria` met → ticket Done. A `blocked` subtask
  with nothing ready blocks the ticket.
- Drive it with the skill CLI (bun, from repo root):
  `bun ~/.config/opencode/skills/task-management/scripts/task-cli.ts status|next|blocked|deps|validate|complete <feature> <seq> "<summary>"`
- `.tmp/tasks/` is ephemeral — quote durable decomposition proof into the
  ticket md before the session ends.

## Memory (Engram)

```bash
# Save decision/fix/pattern
engram mem_save --title "Fixed X" --type bugfix --content "**What**: ... **Why**: ... **Where**: ... **Learned**: ..."

# Search past work
engram mem_search "query"

# Session summary (MANDATORY before done)
engram mem_session_summary --content "## Goal... ## Discoveries... ## Accomplished... ## Next Steps... ## Relevant Files..."
```
