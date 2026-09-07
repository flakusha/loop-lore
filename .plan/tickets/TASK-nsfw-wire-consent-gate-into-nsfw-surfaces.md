<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW: wire consent gate into NSFW surfaces

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-nsfw-integration-gaps.md

## Summary

Gap N1 (verified 2026-09-08): checkNsfwWithConsent (src/middleware/nsfw-gate/consent.ts) has ZERO production callers; persisted consent (migration 069 ledger, no auto-grant) is never consulted. Call it wherever NSFW content is served/generated for an actor pair (seduction attempts, encounter phase text, intimacy actions); denied -> clean refusal + audit event. Plan doc §3/T12. Epic: epic-nsfw-integration-gaps.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
