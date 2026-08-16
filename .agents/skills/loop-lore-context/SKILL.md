---
name: loop-lore-context
description: >
  Use when working on loop-lore (SillyTavern clean reimplementation).
  Provides project overview, architecture, technology constraints,
  and quick-reference commands.
version: 1.0.0
author: loop-lore contributors
license: Apache-2.0 OR MIT
metadata:
  agents:
    tags: [loop-lore, sillytavern, rpg-chat, bun, typescript]
    related_skills: [loop-lore-db, loop-lore-tasks]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Loop-Lore Project Context

LLM RPG Chat reimplementation inspired by SillyTavern, Odysseus, and Open WebUI. Built on TypeScript + Bun with dual TUI/Web UI.

## Technology Constraints

| Layer    | Required                  |
| -------- | ------------------------- |
| Runtime  | Bun (`bun run` directly)  |
| Language | TypeScript 5.4+ strict    |
| Database | `bun:sqlite` + Kysely     |
| TUI      | blessed + blessed-contrib |
| Web      | htmx + Alpine.js          |

## Key Paths

See **AGENTS.md** → "Directory Structure (Key Paths)" for the full listing.

Key directories: `src/db/` (Kysely + schema), `src/routes/` (REST handlers), `src/generation/` (LLM), `src/turning/` (orchestration), `src/crypto/` (encryption), `src/frontend/` (htmx + Alpine), `src/tui/` (blessed widgets), `src/validation/schemas.ts` (TypeBox), `src/regex/` (extraction pipeline), `src/rpg/` (combat, quests, skills, loot), `src/characters/` (avatar, mood, traits), `src/assets/` (metadata extraction), `src/memory/` (budget, provisioning), `src/story/` (multi-LLM story engine).

## ⚠️ Zod/TypeBox Trap

Specs describe Zod in `src/schemas/` — **does not exist**. Real stack: **Elysia `t` (TypeBox)** in `src/validation/schemas.ts`.

## Coding Conventions

See **`.agents/references/recommendations.md`** for full patterns. Key rules:

- **Types**: Interfaces > types; enums for fixed sets; strict mode
- **Files**: One feature per file; <200 lines; `index.ts` exports public API
- **Naming**: camelCase vars/fns, PascalCase classes, UPPER_SNAKE constants
- **Async**: Always handle promises; no bare `.then()` chains
- **JSDoc**: All public exports — @param, @returns, @throws, @example
- **Imports**: Never import DB-specific modules in services (use Kysely types)

## Quick-Reference Commands

```bash
bun run check        # typecheck + lint + format + md lint + db schema gate
bun test src/        # unit tests (203 test files)
bun run db:migrate   # DB migrations
# After a migration change, regenerate schema artifacts (fails `check` otherwise):
bun run db:sync-types && bun run db:sync-manifest
./scripts/worktree.sh list   # active worktrees
```

## Key Design Decisions

- **DB-native bun:sqlite** — no better-sqlite3, no custom adapter layer
- **Kysely** for type-safe queries, schema types, migrations
- **Polymorphic asset linking** — images/audio/video linkable to any entity via `asset_links` table
- **Rule-based assistant** — MVP in `src/assistant/service.ts`, designed for swap to LLM backend
- **Session token auth** — JWT or server-side token lookup
- **No commit of .env** — use `.env.example` only
- **Regex extraction pipeline** — image edits, intents, memory classification, transitions, hallucination guard
- **Multi-provider text2img** — openai, sdapi, sdcpp, comfyui for emotion avatars

## Common Pitfalls

1. **Forgetting `screen.render()` after TUI updates.** Blessed requires manual re-render.
2. **Importing DB-specific modules in services/controllers.** Use Kysely types + db instance only.
3. **Bare `.then()` waterfalls.** Always await or .catch().
4. **Skipping doc reading.** Always read relevant `docs/` before implementing.
5. **Pushing without `bun run check`.** Run typecheck + lint + format + md:lint first.
