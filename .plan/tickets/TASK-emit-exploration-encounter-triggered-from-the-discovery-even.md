<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Emit exploration.encounter_triggered from the discovery event bus

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-exploration-discovery

**Summary:**

Reconciliation of `.plan/epics/epic-exploration-discovery.md` found a declared cross-system event with no emitter.

`epic-exploration-discovery.md:379` declares `exploration.encounter_triggered` as emitting to Battle when a travel encounter starts combat. Line 462 notes it still has no emitter.

The sibling events in `src/rpg/world-discovery/events.ts` and `types.ts` do exist. Only the encounter event is missing.

Implementation: emit `encounter_triggered` from the path that actually starts a travel encounter (the random-encounter engine), and subscribe Battle to it, per the epic's event table. A unit test must cover both the emit and the subscription.

Scope: the emitter plus the Battle subscription. Do not redesign the encounter engine.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
