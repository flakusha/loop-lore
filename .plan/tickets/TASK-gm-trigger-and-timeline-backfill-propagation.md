<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: GM Trigger And Timeline Backfill Propagation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-gm-shadow-notes
**Tags:** gm, trigger, backfill

**Summary:**
GM triggers fire and backfill the timeline relative to the location/discovery/information-propagation chain.

**Context:**
A trigger fired in the past (e.g. "the village was destroyed") should propagate as a fact to all characters who could plausibly learn it now. This ticket wires GM triggers to `epic-memory-propagation`.

**Acceptance Criteria:**
- On `quest_trigger.fired`, write a `world_event` row with `kind` and `tick`.
- Memory propagation rule from `epic-memory-propagation`: for each event, fan out memory rows to actors in scope (location, faction, observer-chain). Each memory row carries the event as pointer (`TASK-memory-compact-pointer-to-message-chain`).
- Backfill vs forward-fill policy: backfill only allowed when `event.tick <= current_world_tick` AND `rule: "post-discovery"`; otherwise forward-fill only (consistent with `TASK-flashback-roleplay-chat-with-memory-propagation` policy).
- Tests: trigger fires; memory rows created with correct scopes; backfill excluded when policy forbids.
