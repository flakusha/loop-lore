<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN choice opt-in with pending-choice send block

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium

## Summary

VN branching choices exist (POST /api/chats/:id/vn/generate-choices, vn_choices table, choice-cards.ts) but are always-on: no opt-in flag, and send is never blocked by pending choices. Add per-chat opt-in for VN decision elements (ask-tool-like decision making, choice selection); while a choice is pending, the turn send gate blocks free-text send until the choice is resolved or dismissed; resolving a choice consumes the beat (records impacts/next scene, releases the slot).

## Acceptance Criteria

- [ ] Per-chat opt-in flag for VN choice elements (default off)
- [ ] Pending choice blocks free send via the turn send gate until resolved/dismissed
- [ ] Choice resolution consumes the beat and applies consequences/next scene
- [ ] Opt-out chat never shows choice UI and never blocks on choices
- [ ] Tests passing
