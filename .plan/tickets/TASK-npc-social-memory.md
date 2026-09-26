<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Npc Social Memory

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Persist NPC conversation outcomes as episodic memory via the existing actor-memories service (`memory_type: episodic`), retrievable for future social decisions.

**Context:** `src/actors/actor-memories.ts` already stores episodic rows; this ticket is the social write/read path on top (what to store per encounter, recall query shape), not new storage. Distinct from `TASK-social-interaction.md` reputation tracking.

**Acceptance Criteria:**

- [ ] Encounter write + recall round-trip tested through actor-memories service.
- [ ] No duplicate rows on re-run (idempotent encounter key).
- [ ] `bun run check` green.
