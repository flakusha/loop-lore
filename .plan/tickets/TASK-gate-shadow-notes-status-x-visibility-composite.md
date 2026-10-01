<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Gate shadow_notes status-x-visibility composite

**Status:** Not Started
**Priority:** medium
**Effort:** Small (composite validator + unit test)
**Epic:** epic-rpg-mechanics.md
**Summary:** `shadow_notes` `status` (player reveal) × `visibility` (LLM gate, migration `002`) need a `CompositeValidator` mirroring `messagesStatusVisibility` (`src/db/enums-core/messages.ts:88`). `author_type` stays an orthogonal plain enum. Unit test. No column changes.
**Context:** DB schema-gate audit (2026-09-25, db-migration-fixes session). The two columns interact (reveal state × LLM visibility) but are validated independently today; the composite mirrors the established messages pattern.

**Acceptance Criteria:**
- [ ] Composite validator for status × visibility mirroring `messagesStatusVisibility` structure.
- [ ] `author_type` remains plain enum (not folded into the composite).
- [ ] Unit test covers valid/invalid combinations.
- [ ] `bun run check` green.

**Tags:** db, shadow-notes, validator, composite
**Related:** src/db/enums-core/messages.ts, src/db migration 002


git issue: dea8a70
