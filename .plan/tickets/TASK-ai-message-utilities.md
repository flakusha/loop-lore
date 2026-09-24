<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AI message utilities (translate/summarize/explain)

**Status:** open
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-rich-engagement.md (proposed)
**Type:** Feature | **Priority:** Medium | **Effort:** S

## Problem

P2 actions in `message-actions.md` (Summarize/Narrate/Analyze) plus
mobile Translate exist in menus, but translate never calls the LLM
(BUG-assistant-improve-translate-rewrite-never-call-llm). Stub UX.

## Change

- Wire selection actions to `aux-pipeline` (not main generation path):
  translate / summarize / explain, result as ephemeral overlay + copy. Tag injected message content with provenance (never system role).
- Reuse existing assistant prompt seam; cap input 2KB, output 500 tokens.
- Alpine: add to message context menu; same visibility matrix as P2.

## Acceptance

- Each action returns LLM text (no static stub); failure surfaces error.
- Main chat generation path untouched; existing BUG ticket closed by this.

## Implementation (2026-09-12, worktree chat-messenger-parity)

In `1bb1a1343` — `POST /api/chats/:id/messages/:mid/ai-action`
(`src/routes/messages/ai-action.ts`) via `callAux("message-action")`
(auxiliary role, 300 max tokens, 4KB source cap); unconfigured model →
503 `ai_unavailable`, result returned never stored. 7 tests (wiring +
`buildAiActionPrompt`; live-LLM success untested — `mock.module` leaks
process-global, see caption.test.ts note). Deviations: actions are
summarize/action-items/explain (translate dropped — one-line follow-up:
add Literal + prompt); no context-menu/overlay UI wired (backend only).
