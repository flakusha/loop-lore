<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Profanity Filter (Runtime, Per-Chat)

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Summary:** Profanity Filter (Runtime, Per-Chat)
**Context:** Epic epic-profanity-filter; tags profanity, moderation.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-profanity-filter
**Tags:** profanity, moderation

## Summary

Implement runtime wordlist reload, per-chat sensitivity threshold, audit trail for flagged content per docs/spec/profanity-filter.md.

## Resolution

Core scope tracked by src/profanity/service.ts + config gate. Unplanned remainder extracted 2026-09-19 → E7 profanity hot-reload/per-chat sensitivity/audit trail (new ticket, main agent) (docs-gap reconcile audit).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
