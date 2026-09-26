<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Ai Director Tension

**Status:** open
**Priority:** medium
**Effort:** Medium
**Summary:** Tension tracking state per chat. Persists current_tension, target_tension, tension_curve (planned arc), pace_modifier, last_event_time, events_since_last_rest. TensionState schema at epic-assistant-gm-flows.md lines 102-118.
**Context:** Source: epic-assistant-gm-flows.md § AI Director → Tension Management. State feeds narrative arc templates and event pacing.
**Acceptance Criteria:** [ ] TensionState persisted on chat state; [ ] paceModifier exposed for auto-gen.ts; [ ] eventsSinceLastRest counter resets on rest event; [ ] tension_curve stored as ordered TensionPoint[].


**Status**: open
**Priority**: medium
**Labels**:
**Assignee**:
**Epic**: epic-assistant-gm-flows
**git issue**: # TODO: file git issue when scope locked
**Related**:

## Summary

Tension tracking and management system

## Acceptance

- [ ] Complete
