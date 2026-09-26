<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: Per-chat Assistant/GM Frontend

**Status:** done
**Priority:** medium
**Effort:** Large
**Summary:** Per-chat Assistant/GM Frontend
**Context:** Epic epic-assistant-gm-flows; tags assistant, gm.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** epic-assistant-gm-flows
**Tags:** assistant, gm

## Summary

--label

## Resolution

Already implemented on dev — verified 2026-09-19 docs-gap reconcile audit (epic-docs-vs-plan-gap-audit-2026-09-19.md):

- src/components/chat/gm-story-panel.html
- src/frontend/alpine/chat-types/gm.ts (assistantRole gm/moderator)

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated


## Current implementation

- `src/components/chat/assistant-panel.html` — assistant command palette and tool-call history.
- `src/components/chat/gm-guidance-panel.html` — shared GM guidance wrapper.
