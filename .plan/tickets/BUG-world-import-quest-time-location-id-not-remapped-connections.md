<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: World import: quest time_location_id not remapped; connections JSON copied verbatim

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

src/routes/world-import/bundle.ts:157 does not remap quest time_location_id through locationIdMap (cf. location_states remap at :185-187): quests.time_location_id FKs locations.id (001_init.ts:2421) and OLD ids cannot exist in the fresh world -> FK violation aborts the whole import transaction for any bundle whose quest carries time_location_id. locations.connections JSON is copied verbatim (bundle.ts:85) -> permanently dangling connection ids in the imported world. Fix: remap time_location_id via locationIdMap (null when unmapped); rewrite connections JSON ids.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
