<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Prompt Improvement — Unified Text Enhancement

**Status:** 🟡 In Progress
**Priority:** High
**Tags:** frontend, aux-pipeline, composer, prompt, security

## Summary

One shared implementation of "improve my prompt" serving every entry point:
the composer toolbar, the `/improve` slash command, and future flows. The
functionality is a gradation over one AUX-backed service — same resolution
(model role, BYO key), same telemetry (`aux.call`), same graceful
degradation — parameterized by level:

| Level | Intent | Temperature |
| --- | --- | --- |
| `spellcheck` | Fix typos/punctuation only | 0.0 |
| `wording` | Improve clarity and word choice, preserve meaning | 0.2 |
| `expand` | Expand detail and depth | 0.5 |
| `strict` | Faithful professional rewrite, semantics unchanged | 0.1 |
| `creative` | Vivid, expressive rewrite | 0.9 |
| `style-chat` | Rewrite bound to the chat's voice (recent messages as style reference) | 0.7 |
| `style-group` | Rewrite bound to group-chat voice (multi-participant) | 0.7 |

Companion feature: **prompt analysis** (`analyze` mode) returns an aux LLM
JSON profile (intent, clarity, suggestions) of the draft before sending.

## Design

- New `AuxTaskName`s: `"prompt-improve"`, `"prompt-analysis"`, `"injection-check"` — additive to `src/aux-pipeline` (the task name is telemetry-only; nothing dispatches on it).
- Service: `src/prompt-improve/` — `improvePrompt({ level, text, ... })` → `callAux("prompt-improve", …, per-level opts)` with a deterministic local-polish fallback on any aux failure (mirrors the graceful-degradation policy of the runner).
- REST: `POST /api/generation/prompt` `{ mode: "improve"|"analyze", level, text, chatId? }` — auth required; `chatId` scoped access via `checkChatAccess`; `style-*` levels build a style reference from the chat's recent messages.
- Security: every outbound improvement (and user message submit) passes a two-step injection check — deterministic signal scan, then an aux LLM classifier confirm when suspicious. See `TASK-prompt-injection-two-step-validation.md`.
- Frontend: composer toolbar button + level menu (shared `input-area.html`, so direct and group chat both get it); Alpine module `chat-actions/prompt-improve.ts` replaces the draft in the textarea with an undo backup.

## Non-goals

- Streaming output for improvement results (aux `complete()` only, like every other AUX task).
- Server-side persistence of drafts or improvements.

## Tickets

| Ticket | Scope |
| --- | --- |
| `TASK-prompt-improve-shared-service.md` | aux task + prompts + service + local fallback |
| `TASK-prompt-improve-composer-ui.md` | composer button + level menu + Alpine module |
| `TASK-prompt-injection-two-step-validation.md` | deterministic + LLM injection validation, wired to message submit and improve route |
| `TASK-prompt-improve-testing.md` | mock-LLM unit/integration coverage for the above |

## Related Epics

- `epic-assistant-generation-extensions.md` — `/improve` command surface (unified through the service here).
- `epic-testing-qa.md` — mock-LLM test infrastructure (`MockLLMProvider`, `registerProvider`).
- `epic-llm-queue.md` + `epic-generation-flow-control.md` — downstream queue/rate-limit regulation; the improve route consumes the same regulation once landed.
