<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: deriveRumors exposes internal actor UUID in user-facing text

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] FIXED (issue 4db0605): src/rpg/reputation.ts:149 looks up display_name; :163 interpolates actorName into the rumor text — no raw UUID in user-facing output.
**Priority:** high
**Effort:** Medium
**Epic:** epic-faction-reputation

**Summary:**

The rumor string (src/rpg/reputation.ts:156) embeds actorId (a UUID) directly in user-facing narrative text: They speak  of  (, ). Impact: Players see raw UUIDs instead of character names, breaking immersion and potentially leaking internal IDs. Fix: Resolve the actor's display name before interpolating, or accept a displayName parameter.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 4db0605 (registry tip: 6cc29d684 Konstantin Fedotov Close issue)
