<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Actors & Entity System

**Overview:** (see sections below)


**Status:** done
**Priority:** High
**Effort:** High
**Type:** Foundation Epic
**Tags:** actors, characters, entities, participants, data-model, import

## Summary

The `actors` table is the unified participant model — every entity that sends messages or participates in chats has an actor entry. Covers data versioning, character card imports (SillyTavern V1/V2), memories, notes, lorebooks, and inventory items.

## Reference

- Spec: `docs/spec/actors.md` (695 lines — authoritative)
- Schema: `src/db/schema-core.ts` (Actors, ActorKeys), `src/db/schema-story.ts` (child tables)
- Migration: `src/db/migrations/001_init.ts`

## Scope

### Data Versioning

- Version table (0–4): pre-stabilisation → card fields → memories → lorebooks → items
- Backward compatibility contract: never remove columns, never repurpose, default values, migrate-on-write
- Backfill script for version upgrades

### Actor Table Extensions

- Character card columns: `welcome_message`, `personality`, `scenario`, `mes_example`, `alternate_greetings`, `post_history_instructions`, `creator_notes`, `creator`, `character_version`, `import_spec`
- V2 spec field mapping (SillyTavern `chara_card_v2` → internal columns)
- Settings JSON blob for rarely-used metadata (tags, extensions, model preferences)

### Child Tables

| Table                | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `actor_memories`     | Accumulated facts learned across conversations (organic, promotion-based) |
| `actor_notes`        | User-authored reference material (structured, category-tagged)            |
| `actor_lore_entries` | Keyword-triggered knowledge embedded in character cards                   |
| `world_lore_entries` | Global lore not tied to a single character                                |
| `actor_items`        | Equipment, possessions, quest items                                       |

### Memory Lifecycle

- Hook trigger: after LLM response, if pipeline has capacity
- Cron trigger: periodic sweep, re-processes recent chats
- Fields: `source_chat_id`, `confidence`, `importance`, `expires_at`, `memory_type`

### Lore Injection Flow

- Collect world lorebooks linked to current chat (via `asset_links`)
- Collect character lorebooks for AI participant actors
- Keyword matching, priority ordering, token budget enforcement

## Tasks

- [ ] Data versioning system (version table, backfill script)
- [ ] Actor table extensions (character card columns, V2 mapping)
- [ ] Actor memories CRUD + lifecycle hooks
- [ ] Actor notes CRUD + category system
- [ ] Lorebook system (actor + world scope, keyword matching, injection)
- [ ] Actor items/inventory CRUD
- [ ] SillyTavern V1 import parser
- [ ] SillyTavern V2 import parser
- [ ] Export format (V2 character card)
- [ ] API routes for actor CRUD
- [ ] API routes for child tables

## Files

- `src/db/schema-core.ts` — Actors, ActorKeys interfaces
- `src/db/schema-story.ts` — child table interfaces
- `src/db/migrations/001_init.ts` — DDL
- `src/routes/actors.ts` — actor CRUD routes (TBD)
- `src/import/` — character card import parsers (TBD)

## Acceptance Criteria

- [x] Actor CRUD with all character card fields
- [x] Data version bump-on-write working (superseded: generic `data-migrations` runner + per-row `format_version`; concrete ladders authored when a real shape change lands)
- [x] Memories, notes, lore, items as separate tables
- [x] SillyTavern V1/V2 import functional
- [ ] Lore injection respects token budget
- [x] Tests passing

## Related Epics

- `epic-gm-shadow-notes.md` — notes system extends actor_notes with shadow behavior
- `epic-items.md` — item system builds on actor_items
- `epic-worlds-extension.md` — world lorebooks
- `epic-chat-lifecycle-moderation.md` — chat lifecycle interacts with actors

## Tickets

| Work Item | Ticket | Git Issue | State (2026-09-25) |
| --------- | ------ | --------- | ------------------ |
| Data versioning (version table 0-4, backfill) | `TASK-actors-data-versioning.md` | 9164e41 | closed — superseded by the generic `src/db/data-migrations/` runner + per-row `format_version`; no v0–v4 ladder ever existed to backfill |
| Child tables CRUD (memories/notes/lore/items) | `TASK-actors-child-tables-crud.md` | c62dfff | services landed on dev (`src/actors/`); ticket open pending AC verification (promote/demote, cron sweep, token-budget lore match, item transfer) |
| API routes (actors + child tables) | `TASK-actors-api-routes.md` | f86deef | routes landed on dev (`src/routes/actor-*.ts` via `entity-routes` factory); ticket open pending AC verification (lore-match budget cap, atomic transfer) |
| SillyTavern V1/V2 import/export | `TASK-actors-import-export.md` | 9fd4c89 | closed — implemented (CHARX/PNG/JSON import, CCv2/CCv3 export, `/api/actors/:id/card`, round-trip + 400 tests) |

4-bucket grouping per the 2026-09-23 recommendation (option 2); each bucket carries self-contained acceptance tests and tracks the existing source layout (schema-core / schema-story / import / routes). The former `TASK-actors.md` 1-line stub is superseded by these four.

