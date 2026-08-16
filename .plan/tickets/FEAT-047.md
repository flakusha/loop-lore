---
title: "FEAT-047: Branch UI controls"
status: open
priority: medium
labels: [feature, chat, frontend]
epic: epic-conversation-branching
related: [FEAT-045, FEAT-046]
---

<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT-047: Branch UI controls

## What

Frontend UI for conversation branching: branch indicator on messages, fork button, branch switcher, branch list panel, and merge confirmation.

## Why

The backend (FEAT-045 + FEAT-046) provides branching data and API. Users need an intuitive UI to actually use branches: see where branches exist, create new ones, switch between them, and manage branch lifecycle.

## Current State

- `src/views/chat.html` — main chat view
- `src/frontend/alpine/` — Alpine.js components for chat
- No branch UI exists

## Acceptance Criteria

- [ ] **Branch indicator** — messages that are branch fork points show a subtle branch icon with branch count tooltip
- [ ] **Fork button** — context menu on any message includes "Branch from here" option
- [ ] **Branch switcher** — dropdown in chat header showing all branches, current branch highlighted, with switch action
- [ ] **Branch list panel** — sidebar tab listing all branches with: name, fork point preview, message count, last activity, delete button
- [ ] **Branch comparison** — diff view showing messages unique to each branch (stretch goal)
- [ ] **Merge confirmation** — modal confirming merge with preview of messages to be appended
- [ ] **Mobile responsive** — branch controls work on touch devices
- [ ] Alpine.js component tests for branch switching and fork creation

## Implementation Notes

- Alpine component: `src/frontend/alpine/chat-branches.ts` (new, <200L)
- Branch switcher: extend existing chat header Alpine component
- Fork: `POST /api/chats/:id/branches` with `parent_message_id` from context menu
- htmx: use `hx-post` for fork, `hx-patch` for switch, `hx-delete` for remove
- Branch list: load via `GET /api/chats/:id/branches` on panel open
- Size gate: frontend branch files <250L each

## Dependencies

- Blocked by: FEAT-045 (data model), FEAT-046 (API)
- Blocks: nothing
