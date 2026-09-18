<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: story mode runcontenthooks integration test

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Epic:** review-dev-2026-08-26-security-data-integrity-merges

## Summary

story-mode.ts now calls runContentHooks (NSFW gate + emotion + mood + moderation) before persisting. content-hooks-nsfw-gate.test.ts covers the precheck, but story-mode integration (hooks.allowed false means story NOT persisted; dominantEmotion propagated to message) has no direct test. Add a regression test in story-mode.test.ts using a test DB and a fake actor rating.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
