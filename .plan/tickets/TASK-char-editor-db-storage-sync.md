<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-char-editor-db-storage-sync

**Status**: open
**Priority**: high
**Labels**: backend, db, character-editor, schema, api
**Assignee**:
**Epic**: epic-character-core-system
**Related**: `src/db/schema-character.ts`, `src/routes/characters/`, `src/characters/spec/`

## Description

The character edit form saves to `PUT /api/actors/:id` (ActorUpdateBody) which
updates 8 flat fields on the `actors` table. But the spec defines 20+ fields,
plus trait tables, mood table, NSFW tables, extensions JSON — all of which are
edited in separate API calls or not at all.

The structured editor (TASK-char-editor-structured-fields-ui) needs a unified
save endpoint that handles all character data in one transaction.

### Current State

- `PUT /api/actors/:id` → updates `display_name`, `description`, `personality`, `scenario`, `welcome_message`, `mes_example`, `system_prompt`, `post_history_instructions`, `content_rating`, `avatar_asset_id`
- Internal traits: `saveAllTraits()` calls separate `PUT /api/characters/:id/traits/internal`
- World traits: separate endpoints under `src/routes/character-traits/`
- Mood: separate endpoints under `src/routes/character-mood/`
- Relationships: separate endpoints under `src/routes/character-relationships.ts`
- NSFW traits: no endpoints
- Extensions: no endpoints
- Review workflow: no endpoints

### Acceptance Criteria

- [ ] Unified character save endpoint: `PUT /api/characters/:id` accepts full character card
- [ ] Request body: `CharacterSaveBody` containing all spec-defined fields + trait arrays + mood + NSFW + extensions
- [ ] Single DB transaction: all tables updated atomically, rollback on any failure
- [ ] Partial update support: omit fields to leave unchanged (PATCH semantics)
- [ ] Validation runs server-side before save: field constraints, world rules, content rating propagation
- [ ] Review state transitions: `draft` → `pending_review` on submit
- [ ] Audit trail: who changed what, when (actor_audit_log table)
- [ ] Response includes full resolved character with all traits, mood, etc.
- [ ] Backward compatible: existing `PUT /api/actors/:id` still works (deprecated, not removed)
- [ ] API test: full save round-trip, partial update, transaction rollback, audit log
- [ ] DB migration if needed for new columns (creation_date, modification_date, visibility, depth_prompts, response_style, bookmarked, review_status)

### Notes

- The `actors` table already has a JSON `settings` column — could store extensions, depth_prompts, response_style there
- `data_source_format` column mentioned in spec §4.2 for YAML/TOML source storage — may not exist yet
- Audit log pattern: `actor_audit_log (id, actor_id, user_id, changed_fields, old_values, new_values, created_at)`
- Character save body should use Elysia `t` (TypeBox) schema in `src/validation/schemas/`
- Trait arrays (permanent, world, location, internal, NSFW) are upserted: delete missing, insert new, update changed
