<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Context Injection Correctness

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

## Findings → Tickets

| Ticket | Severity | Summary |
| ------ | -------- | ------- |
| [BUG-chat-history-truncates-to-oldest-messages-drops-recent-turns](../tickets/BUG-chat-history-truncates-to-oldest-messages-drops-recent-turns.md) | high | Chat history ordered `created_at ASC` + `limit(tokenBudget/4)` keeps oldest, drops newest; `chatHistory` is `PRIORITY 0` so never trimmed. |
| [BUG-auto-gen-assemble-omits-providerid-tokenbudget-and-never-compacts](../tickets/BUG-auto-gen-assemble-omits-providerid-tokenbudget-and-never-com.md) | high | `prepare-generation.ts:90` omits `providerId`/`tokenBudget`; budget defaults 32000, no compaction; `compactPromptHistory` dead. |
| [BUG-group-participant-injection-absent-on-manual-generate-route](../tickets/BUG-group-participant-injection-absent-on-manual-generate-route.md) | medium | `groupParticipantIds` only set in auto-gen; manual route + context-budget omit it; includes user participants. |
| [BUG-computecontextwindow-phase-3-trims-newest-instead-of-oldest](../tickets/BUG-computecontextwindow-phase-3-trims-newest-instead-of-oldest.md) | low | `computeContextWindow` phase-3 keeps oldest on overflow; latent (handlers uses only `totalTokens`). |

## Open verification (not yet filed)

- Provider adapters: confirm single-`system` adapters don't double-inject or drop
  auxiliary system-role sections (nsfwPolicy, groupParticipants, userPersona).
- `chat-history.ts` role filter excludes `Narrator` — confirm intended.
- Confirm group chats never reach the manual generate route (affects BUG-3 severity).

## Status

Tickets filed. Implementation pending. No code changes made during review.
