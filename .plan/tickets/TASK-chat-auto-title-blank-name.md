<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Chat auto-title for blank-name chats

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** Small
**Summary:** Auto-generate a chat title when the user leaves the name blank
**Context:** Found 2026-09-19 docs-gap sweep of previously-unaudited dirs; source docs/guide/first-chat.md; no .plan artifact (auto.?title → 0 hits)
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-chat-product-features
**Tags:** chat, ux, frontend

## Summary

docs/guide/first-chat.md tells users a blank chat name gets an automatic title, but nothing in `.plan/` tracks implementing that (verified 2026-09-19). Implement: blank-name chat gets a generated title by the first assistant turn (fallback: truncated first user message); user-provided names never overwritten; update the guide if shipped behavior differs.

## Acceptance Criteria

- [ ] Blank-name chat gets a generated title by first assistant turn (fallback: truncated first user message)
- [ ] User-provided names never overwritten
- [ ] Guide text matches implemented behavior
- [ ] Unit test: blank name → title present; named chat → name preserved
