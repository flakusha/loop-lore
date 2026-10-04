<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: POST /actors/:actorId/emotions is a dead endpoint - always 500

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Handler destructures { emotionId, intensity, ... } from the body (src/routes/character-emotions/actor.ts:124-180) but the mounted CharacterEmotionBody declares only emotion_name + optional intensity (src/validation/schemas/character-systems.ts:203-206) - emotionId is ALWAYS undefined, the upsert inserts emotion_id=undefined, Kysely drops the column, and character_emotions.emotion_id (NOT NULL, FK -> emotions.id, 001_init.ts:1219) violations 500 every call. Schema intensity is 0-100 while the column scale is 0-1 (default 0.5) - even a fixed body stores out-of-scale values. Fix: align handler+schema on one field name, validate against the emotions lookup, clamp intensity to the column scale.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - the handler destructures emotionId from the body (src/routes/character-emotions/actor.ts:137, insert :166-169) while the mounted schema declares only emotion_name + intensity 0-100 vs the 0-1 column scale (src/validation/schemas/character-systems.ts:203-206), so emotionId is always undefined -> NOT NULL FK violation -> 500, unchanged. No branch or worktree touches this file or the schema with a fix (pickaxe: refactors/lint only).
