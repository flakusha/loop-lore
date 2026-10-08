<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Context Injection Correctness

**Status:** In Progress

**Status Note:** 3 of 4 filed bugs fixed in `src/`. 1 partial (manual route group participants). 2 new gaps identified during review (NG-1, NG-2). See Findings table for per-ticket status.
**Priority:** medium
**Effort:** Medium
**Type:** epic
**Tags:** context-injection, prompt-assembly, group-chat, token-budget
**Overview:** (see sections below)


## Goal

Audit and harden how the assistant, chat, and group-chat layers assemble the
LLM prompt context window. Ensure recent turns are retained, the token budget
is enforced on every generation path, and group-chat participants are injected
consistently.

## Scope

- `src/assistant/prompt-assembler.ts` — orchestration + budget resolution
- `src/assistant/prompt-budget.ts` — `dropOverBudgetSections`, `reorderPromptMessages`, dead `compactPromptHistory`
- `src/assistant/prompt/sections/chat-history.ts` — history window selection
- `src/assistant/prompt/sections/group-participants.ts` — group participant cards
- `src/assistant/prompt/sections/user-persona.ts` — impersonation / persona
- `src/generation/generate-route/build-prompt.ts` — manual generate route
- `src/generation/auto-gen/prepare-generation.ts` — auto-gen / group route
- `src/chat/context-window.ts` — `computeContextWindow` sliding window
- `src/group-chat/turn-selector.ts`, `src/group-chat/mention-parser.ts` — turn/mention logic

## Spec Alignment

| Spec | Status | Notes |
| --- | --- | --- |
| `docs/spec/architecture.md` | 🟡 partial | Prompt assembly pipeline not documented in architecture spec |
| `docs/spec/messages.md` | ✅ aligned | Chat history window behavior matches spec intent |

## Findings → Tickets

| Ticket | Severity | Status | Summary |
| ------ | -------- | ------ | ------- |
| `BUG-chat-history-truncates-to-oldest-messages-drops-recent-turns.md` | high | **Done** | Chat history ordered `created_at ASC` + `limit(tokenBudget/4)` keeps oldest, drops newest; `chatHistory` is `PRIORITY 0` so never trimmed. |
| `BUG-auto-gen-assemble-omits-providerid-tokenbudget-and-never-compacts.md` | high | **Done** | `prepare-generation.ts:90` omits `providerId`/`tokenBudget`; budget defaults 32000, no compaction; `compactPromptHistory` dead. |
| `BUG-group-participant-injection-absent-on-manual-generate-route.md` | medium | **Partial** | `groupParticipantIds` only set in auto-gen; manual route + context-budget omit it; includes user participants. Fix: add join to actors + `actor_type <> 'user'` in `prepare-generation.ts:89-92`. |
| `BUG-computecontextwindow-phase-3-trims-newest-instead-of-oldest.md` | low | **Done** | `computeContextWindow` phase-3 keeps oldest on overflow; latent (handlers uses only `totalTokens`). |
| `BUG-group-participant-user-actors-injected-in-auto-gen-path.md` | medium | **New** | Auto-gen path doesn't filter user actors from group participants → parity with manual route. |

## Open verification (not yet filed)

- Provider adapters: confirm single-`system` adapters don't double-inject or drop
  auxiliary system-role sections (nsfwPolicy, groupParticipants, userPersona).
- `chat-history.ts` role filter excludes `Narrator` — confirm intended.
- Confirm group chats never reach the manual generate route (affects BUG-3 severity).

## Status

Tickets filed. 3 of 4 bugs fixed in `src/`. 1 partial fix (manual route group participants — needs `actor_type <> 'user'` filter). 2 new gaps identified during review (NG-1 auto-gen user-actor filter, NG-2 stale `compactPromptHistory` comment). Implementation ongoing.
