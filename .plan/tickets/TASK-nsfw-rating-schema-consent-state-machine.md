<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: NSFW Rating Schema & Consent State Machine

**Status:** ✅ Resolved (already on dev, 2026-09-19)
**Priority:** high
**Effort:** Large
**Summary:** NSFW Rating Schema & Consent State Machine
**Context:** Epic epic-nsfw-capabilities; tags nsfw, consent.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-nsfw-capabilities
**Tags:** nsfw, consent

## Summary

Implement NSFW rating schema (AO/Gallery/None), consent state machine, age gate enforcement, per-world NSFW opt-in per docs/spec/nsfw.md.

## Resolution

Already implemented on dev — verified 2026-09-19 docs-gap reconcile audit (epic-docs-vs-plan-gap-audit-2026-09-19.md):

- epic-nsfw-capabilities.md [x] ContentRating + ConsentState
- src/generation/auto-gen.ts:412

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
