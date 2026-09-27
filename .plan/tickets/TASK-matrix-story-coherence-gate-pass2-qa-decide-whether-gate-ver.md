<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: MATRIX-story-coherence-gate-pass2-qa: decide whether gate verdict engines run in pass-2 QA

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-two-pass-delivery
**Tags:** matrix-gap, story-coherence
**Context:** Two-pass delivery immersion-gate decision SC4; whether verdict engines run in pass-2 QA is unresolved.

## Summary

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Summary:** matrix-story-coherence SC4 is open: the immersion gate audits user input pre-pass-1, but generated actor output can also break consistency. Whether the verdict engines also run in pass-2 QA is undecided and must resolve before two-pass implementation; the gate/skip interlock seam already exists in code.
**Acceptance Criteria:**
- [ ] Decision recorded: pass-2 QA runs gate verdict engines or not, with scope (which verdicts)
- [ ] Interaction with gate.verdict event, skip interlock, and turn_skip absence record specified
- [ ] matrix-story-coherence.md SC4 row updated with decision
**Tags:** matrix-gap, story-coherence
**Related:** src/chat/service/crud/turn-skip.ts, src/generation/auto-gen/pass-filter.ts, src/group-chat/turn-selector.ts, .plan/matrix-story-coherence.md

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
