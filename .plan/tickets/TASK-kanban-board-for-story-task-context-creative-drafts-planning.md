<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Kanban board for story, task, context, creative, drafts planning

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-assistant-step-planning
**Tags:** assistant, planning, kanban

**Summary:** Board projection over plan_items: columns by state with kind swimlanes (story/task/context/steps/creative/drafts ideas). Card move updates todo state (same rows). htmx partials + Alpine drag, button-move fallback; per-card links to chats/stories/RAG items.

**Context:** Story, task, context, steps, creative, and drafts-ideas planning need a board view over the same rows the todo list shows; existing chat/panel htmx patterns are reused, no new framework.

**Acceptance Criteria:**

- [ ] Moving a card updates todo state, visible in both views.
- [ ] Per-card links to chats/stories/RAG items resolve.
- [ ] `bun run check` green.
