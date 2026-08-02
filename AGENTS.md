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

Budget profiles: `ultra_lean` (8k), `lean` (12k), `balanced` (15k) — see lean-ctx docs.

## Coding Conventions (Summary)

See **`.agents/references/recommendations.md`** for full patterns (options-object params, factory functions, discriminated unions, exhaustiveness checking, branded types, Result type, async hygiene, structured logging, input validation checklist).

Key rules in this file:

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One feature per file; <200 lines; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE constants
- **Async**: Always handle promises; no bare `.then()` chains
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services (use Kysely types)

## Project Overview

Reimplement SillyTavern RPG chat:

- TUI (blessed) + Web UI (htmx + Alpine.js)
- DB: `bun:sqlite` → Kysely (PG via dialect swap)
- Assets (images/audio/video) — polymorphic linking
- Enhanced assistant, user mgmt, multi-session
- VN scene generation with choice cards
- Emotion avatars with multi-provider text2img fallback
- Regex extraction pipeline (image edits, intents, memory, transitions, etc.)
- 203 test files covering services, routes, middleware, crypto, RPG systems

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
./scripts/worktree.sh issues
./scripts/worktree.sh search "your topic"
```

## Directory Structure (Key Paths)

```
src/
├── server.ts            # HTTP entry
├── elysia-app.ts        # Elysia setup
├── db/                  # Kysely + schema
├── config/              # Config loading
├── routes/              # REST handlers
├── generation/          # LLM generation
├── story/               # Multi-LLM story
├── turning/             # Turn orchestration
├── crypto/              # Encryption
├── frontend/            # htmx + Alpine.js
├── plugins/             # Plugin system
├── tui/                 # Blessed widgets
├── regex/               # Extraction pipeline (image edits, intents, memory, etc.)
├── rpg/                 # RPG subsystems (combat, quests, skills, loot, etc.)
├── characters/          # Character services (avatar, mood, traits, relationships)
├── assets/              # Asset service + metadata extraction
├── memory/              # Memory budget, provisioning, purge
├── i18n/                # Internationalization
├── group-chat/          # Group chat mention parsing
├── assistant/           # Rule-based assistant + commands
├── admin/               # Admin config, provider health
├── middleware/           # Auth, NSFW gate, solo user, rate limit
├── transport/           # WebSocket transport layer
├── content/             # Hash injection, compression, encoding
├── personas/            # Persona service
├── notifications/       # Notification service
├── profanity/           # Profanity filter
├── age-gate/            # Age gate service
├── telemetry/           # Telemetry
├── test-utils/          # Test insert helpers
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
bun run check        # typecheck + lint + format + md lint + db schema gate
bun test src/        # unit tests
E2E_SAFEGUARD=1 bun test tests/e2e/  # e2e (if affecting)
```

### DB schema regeneration (required after any migration change)

Migrations (`src/db/migrations/*.ts`) are the single source of truth for the
DB schema. All downstream schema artifacts are **auto-generated** from them
and must be regenerated whenever a migration is added or edited. The `check`
gate (`db:schemas:check`) fails red until they are:

```bash
# Regenerate after a migration change:
bun run db:sync-types && bun run db:sync-manifest
# Verify the gate is green:
bun run db:schemas:check
```

Generated (never hand-edit): `src/db/schema-*.ts`, `src/db/schema.ts`,
`src/db/schema-manifest.ts`, `src/test-utils/insert-helpers.ts`,
`src/validation/db-schemas.ts`. e2e provisioning and unit tests build the
schema directly from migrations, so they pick changes up automatically.

## Worktree Workflow

```bash
# Create worktree
./scripts/worktree.sh new feature-name

# Work in worktree
cd tree/feature-name

# Agent commit (GPG-signed)
./scripts/worktree.sh agent-commit feature-name "feat(scope): message"

# Finalize (checks + signed merge + cleanup)
./scripts/worktree.sh finalize feature-name
```

## Issue Tracking

```bash
# Create ticket
./scripts/worktree.sh ticket TASK 001 "Title" "Description"

# List/Search
./scripts/worktree.sh issues
./scripts/worktree.sh search "pattern"

# Show/Comment/Attach
./scripts/worktree.sh show TASK-001
./scripts/worktree.sh comment TASK-001 -m "text"
./scripts/worktree.sh attach TASK-001 ./file.md

# Direct git-issue
./scripts/worktree.sh gi <command>
```

## Planning System

- **`.plan/epics/`** — epic definitions
- **`.plan/tickets/`** — task tickets
- **`.plan/epics.md`** — consolidated status
- **`.plan/features/`** — feature specs

**`.plan/` is source of truth**; `docs/meta/` is reference only.

## Memory (Engram)

```bash
# Save decision/fix/pattern
engram mem_save --title "Fixed X" --type bugfix --content "**What**: ... **Why**: ... **Where**: ... **Learned**: ..."

# Search past work
engram mem_search "query"

# Session summary (MANDATORY before done)
engram mem_session_summary --content "## Goal... ## Discoveries... ## Accomplished... ## Next Steps... ## Relevant Files..."
```
