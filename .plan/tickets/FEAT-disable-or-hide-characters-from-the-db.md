<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# FEAT: disable or hide characters from the DB

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-actors

**Summary:**

## Summary

There is no DB-level way to disable or hide a character (or any other actor row). Everything needed for it exists but is unwired in one direction:

- `actors.review_state` (`src/db/migrations/042_actor_review_state.ts`, default `pending_review`) has producers for `draft` / `pending_review` / `approved` / `rejected` only (`src/characters/service/approval.ts:113-154`). `ReviewState.Archived` (`src/characters/spec/enums.ts:31`) has **no producer** anywhere.
- **No listing filters on it.** `src/routes/views/characters.ts:66-72` selects `actor_type != User` and nothing else, so a `draft`, `pending_review`, `rejected` or `archived` character still renders in the grid — `buildCharactersGridViewModel` only turns the state into a badge (`src/characters/views/view-models/characters-grid.ts:52`).
- `admin_character_overrides.visibility_override` (`src/db/migrations/001_init.ts:967`) is written and read only by `src/routes/admin-character-overrides.ts`; no listing consumes it.
- `actors.plan_visible` (`src/db/migrations/051_bdi_reflection_cadence_and_plan_visibility.ts:33`) is the existing precedent for a DB-level per-actor toggle that gates a surface — `src/routes/actor-plan.ts:46` 404s unless it is 1, with the comment "an invisible plan is not something the route confirms".

## Fix (proposed — reuse, no migration)

1. Use `ReviewState.Archived` as the hidden state: add an `archive` transition beside the existing ones in `src/characters/service/approval.ts` (same `setReviewState` write, same reviewer guard) plus a route beside `src/routes/characters/approval.ts`.
2. Filter it in every user-facing listing: characters grid (`routes/views/characters.ts:66-72`), the chat list (`serveCharacterChatListDb`), and the asset/gallery actor joins (`src/routes/views/gallery.ts:121-124`).
3. Hidden rows stay owned, editable and exportable — hide is not delete.

Alternative if review state must stay a purely editorial lifecycle: a new `NNN_actor_disabled` column on `actors` (covers every entity type, not just characters) — costs a migration plus a generated-schema refresh, and duplicates a value the enum already has.

**Context:**

Operator request: "db must be able to disable/hide entities, e.g. characters". The characters grid currently has no state filter at all, so a `draft` or `rejected` character is already listed for every user; the same missing filter blocks any future listing of other actor types (personas, group members). Constraint: prefer reusing `ReviewState.Archived` — it exists in the enum with no producer — over a new column.

**Acceptance Criteria:**

- [ ] a DB value exists that hides a character from every user-facing listing
- [ ] the transition is reachable through the app (service + route), not only SQL
- [ ] characters grid, chat list and asset/gallery actor joins all filter it
- [ ] hidden rows remain readable/editable/exportable by their owner
- [ ] test asserting a hidden character is absent from the grid view-model
