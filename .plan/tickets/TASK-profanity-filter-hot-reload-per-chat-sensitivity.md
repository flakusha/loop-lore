<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Profanity filter — hot reload, per-chat sensitivity, audit trail

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Medium
**Summary:** Runtime configurability for the shipped profanity filter: hot reload, per-chat sensitivity, moderation audit trail
**Context:** Extracted 2026-09-19 docs-gap reconcile (remainder of closed TASK-profanity-filter-runtime-per-chat; core runtime shipped — src/profanity/service.ts + profanity_filter config gate + hidden_by_moderator in src/routes/messages/create.ts)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Tags:** moderation, profanity, config

## Summary

The profanity filter ships as a runtime gate, but word-list changes require restart, sensitivity is global (no per-chat override), and filter interventions are not audit-logged. These three aspects are unplanned (verified 2026-09-19: no .plan artifact).

Source: docs/spec/profanity-filter.md runtime-configuration section; extraction E7 of epic-docs-vs-plan-gap-audit-2026-09-19.md.

## Acceptance Criteria

- [ ] Hot reload of word lists without server restart
- [ ] Per-chat sensitivity override (inherit | stricter | looser) with validation
- [ ] Audit trail rows for filter interventions (chat, message, rule hit, action)
- [ ] Unit tests: reload picks up list change; override precedence; audit row written
- [ ] `bun run check` passes
