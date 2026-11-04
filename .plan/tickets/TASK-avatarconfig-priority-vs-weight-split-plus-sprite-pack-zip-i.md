<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: AvatarConfig priority-vs-weight split plus sprite-pack ZIP importer (Agnai/ST patterns)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Two small portability wins from research 07 gaps 3+6. (a) Agnai splits admission (priority: sort, fill budget top-down) from placement (weight: higher = lower in prompt = more influence); our AvatarConfig weights + fallbackOrder conflate both - split before adding knobs. (b) ST folder-pack interchange (joy.png / joy-1.png flat ZIP, costume override) as one-way importer into gallery + avatar rows; no storage change. No dup: priority search shows only unrelated budget tickets. Research: .tmp/research/ai-cheat/07-character-avatar-emotion-voice.md gaps 3, 6. Non-goals: Caveduck bio-states (gap 5 explicit non-goal), namespaced extensions block (gap 4, defer to card-export work). Closes the char-research lane.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
