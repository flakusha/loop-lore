<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: CLARIFY-story-state-sse-subscription-contract

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-story-mode-ui
**Tags:** frontend, story
**Summary:** Subscribe window.storyState.refresh to the world-scoped snapshot/event SSE feed instead of poll-only re-pull.
**Context:** TASK-story-alpine SSE criterion open; feed contract owned by git issue 580d430; refresh() re-pull retained as offline fallback.
**Acceptance Criteria:** SSE subscription with reconnect plus stale-chatId guard; poll fallback retained.

## Summary

Subscribe window.storyState.refresh to the world-scoped snapshot/event SSE feed instead of poll-only re-pull. Parent: TASK-story-alpine (SSE criterion open). Feed contract owned by git issue 580d430. Keep refresh() re-pull as offline fallback; add reconnect plus stale-chatId guard.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
