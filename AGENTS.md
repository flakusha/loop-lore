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

## Project Overview

Reimplement SillyTavern RPG chat:

- TUI (blessed) + Web UI (htmx + Alpine.js)
- DB: `bun:sqlite` → Kysely (PG via dialect swap)
- Assets (images/audio/video) — polymorphic linking
- Enhanced assistant, user mgmt, multi-session

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
└── tui/                 # Blessed widgets

docs/spec/               # Core specs
docs/frontend/           # UX specs
.plan/                   # Task tracking (source of truth)
```

## Coding Conventions

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One feature per file; <200 lines; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE constants
- **Async**: Always handle promises; no bare `.then()` chains
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services (use Kysely types)

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
bun run check        # typecheck + lint + format + md lint
bun test src/        # unit tests
E2E_SAFEGUARD=1 bun test tests/e2e/  # e2e (if affecting)
```

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
