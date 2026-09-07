<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: NSFW: gate /api/nsfw routes (authZ + access + consent)

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-nsfw-integration-gaps.md

## Summary

Gap N2 (verified): zero nsfw-gate/canAccessNsfw/consent refs in src/routes/nsfw/ (seduction, encounters, intimacy, fantasies, location). Enforce authZ + canAccessNsfw (+ consent where actor-targeted) on every route; tests for unauthed/underage/no-consent 403s. Plan doc §3/T13. Epic: epic-nsfw-integration-gaps.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
