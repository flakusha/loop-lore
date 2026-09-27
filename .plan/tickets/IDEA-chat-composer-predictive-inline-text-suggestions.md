<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Chat composer: predictive inline text suggestions

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-chat-product-features.md

## Summary

No inline typing assistance; proactive/ in loop-lore means server-event timing (src/chat/proactive), not autocomplete. Product decision needed before build: LLM-backed ghost-text vs local n-gram history; cost/latency/privacy tradeoffs; opt-in default-off. File as IDEA: needs product call; do not implement without accepted proposal.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Proposal (filed 2026-09-27)

See `.plan/tickets/IDEA-chat-composer-inline-suggestions-proposal.md` for the three-path proposal (LLM ghost-text / local n-gram / hybrid), acceptance criteria, and the explicit decision needed before implementation. Original ticket left Not Started pending that product call.
