<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: AI message utilities (translate/summarize/explain)

**Status:** Done
**Summary:** AI message utilities complete: translate wired into the aux-pipeline ai-action endpoint (language param) + context-menu actions for summarize/explain/action-items/translate with clipboard copy.
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-chat-rich-engagement
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
summarize/action-items/explain (translate dropped - one-line follow-up:
add Literal + prompt); no context-menu/overlay UI wired (backend only).

**Resolved:** 2026-10-23 registry-driven close: git issue 11a3988 (registry tip: 3302e1090 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-AI-MESSAGE-UTILITIES done)

## Resolution (2026-10-22, worktree chat-rich-engagement)

Complete - closes this ticket and the follow-ups above.

- Translate wired: `validation/schemas/messages.ts` adds the
  `translate` Literal + optional `language` (2-35 chars);
  `routes/messages/ai-action.ts` adds the translate prompt
  ("Translate the following chat message into ${language}. Output
  ONLY the translated text.") and a `language_required` 422 guard;
  still aux-pipeline only (`callAux("message-action")`), result never
  stored, 503 when no aux model.
- Frontend (`frontend/alpine/chat-actions/message-tools.ts`):
  `runMessageAiAction` accepts `language`; translate prompts for the
  target language (default `navigator.language`), successful results
  are copied to the clipboard and surfaced as an ephemeral toast;
  503/error paths unchanged. Context menu in
  `components/chat/message-list.html` gains Explain, Action items and
  Translate buttons (same visibility as Summarize).
- i18n keys `chats.aiExplain` / `chats.aiActionItems` /
  `chats.aiTranslate` / `chats.aiTranslatePrompt` across 10 locales.
- Docs: `docs/frontend/chat/message-actions.md` P2 action table and
  role-visibility matrix extended.
- BUG-assistant-improve-translate-rewrite-never-call-llm needs no
  further action: already verified Done on dev (2026-09-07) - the
  /translate slash command LLM path predates this epic; this ticket
  covers the message-selection translate surface.
- Tests: `routes/messages/ai-action.test.ts` (translate 422
  language_required, translate to 503 aux seam, prompt assertions) and
  `frontend/alpine/chat-actions/message-tools.test.ts` (translate
  language in body, no-language no-op; 9 pass under `--isolate`).
  tsc clean; gates PASS: template preflight, innerHTML xss, coverage
  gaps, size-strict, i18n static keys, i18n reconcile.
