<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: POST /actors/:actorId/emotions is a dead endpoint - always 500

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-actors

**Summary:**

Handler destructures { emotionId, intensity, ... } from the body (src/routes/character-emotions/actor.ts:124-180) but the mounted CharacterEmotionBody declares only emotion_name + optional intensity (src/validation/schemas/character-systems.ts:203-206) - emotionId is ALWAYS undefined, the upsert inserts emotion_id=undefined, Kysely drops the column, and character_emotions.emotion_id (NOT NULL, FK -> emotions.id, 001_init.ts:1219) violations 500 every call. Schema intensity is 0-100 while the column scale is 0-1 (default 0.5) - even a fixed body stores out-of-scale values. Fix: align handler+schema on one field name, validate against the emotions lookup, clamp intensity to the column scale.

**Context:**

The handler won the field-name argument: `character_emotions.emotion_id` is a foreign key to `emotions.id`, so a row can only point at an emotion *definition* — the write path is keyed by id, not by name, and the frontend only reads this endpoint (it never posts a body). The schema therefore now declares `emotionId` (uuid) plus the optional `context` / `expiresAt` the handler already wrote, and `intensity` is bounded to the 0-1 scale of the column instead of the schema's 0-100.

With the contract aligned, an unknown `emotionId` would still fail the insert as a driver error (500), so the handler resolves the definition first and answers 404 — the same status the read path uses for an unknown emotion.

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolution:**

- `src/validation/schemas/character-systems.ts:206-211` — `CharacterEmotionBody` now declares `emotionId` (uuid), `intensity` (0-1, the column scale), and the optional `context` / `expiresAt` the handler writes; `emotion_name` is gone.
- `src/routes/character-emotions/actor.ts:138-156` — the handler resolves the emotion definition before the upsert and answers 404 for an unknown id instead of letting the insert fail.
- Regression tests: `src/routes/character-emotions/actor.test.ts` → "post upserts the emotion row for a known emotion id" (201 and the row is persisted with the given intensity), "post updates the intensity of an emotion the actor already has", "post returns 404 for an unknown emotion id instead of failing the insert".

## Review 2026-10-04

OPEN on dev - the handler destructures emotionId from the body (src/routes/character-emotions/actor.ts:137, insert :166-169) while the mounted schema declares only emotion_name + intensity 0-100 vs the 0-1 column scale (src/validation/schemas/character-systems.ts:203-206), so emotionId is always undefined -> NOT NULL FK violation -> 500, unchanged. No branch or worktree touches this file or the schema with a fix (pickaxe: refactors/lint only).

**Resolved:** 2026-10-24 registry-driven close: git issue f3fbf56 (registry tip: 72afa5112 Konstantin Fedotov Auto-closed: appended .md marker marks BUG-POST-ACTORS-ACTORID-EMOTIONS)
