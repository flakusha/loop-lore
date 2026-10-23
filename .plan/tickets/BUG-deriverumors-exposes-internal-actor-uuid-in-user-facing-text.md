<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: deriveRumors exposes internal actor UUID in user-facing text

**Status:** Not Started
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
