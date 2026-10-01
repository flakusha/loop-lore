<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA: Chat composer — predictive inline text suggestions (proposal)

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-chat-composer-flows.md
**Tags:** chat-composer-flows
**Summary:** Inline typing assistance for the chat composer — proactive completion that fires as the user types. Several implementation paths; product decision required before any code.
**Context:** Loop-lore has no inline typing assistance today. Other UIs (GitHub Copilot, Gmail Smart Compose, ChatGPT composer) ship ghost-text completion — low-confidence suggestion that fills the next phrase. Usefulness vs intrusiveness depends on quality, latency, and dismiss controls. The repo has a related but separate module: `src/chat/proactive/` is server-event timing (when to push a system message), NOT local text completion — do not conflate them. Three implementation paths exist (LLM ghost-text, local n-gram over user history, hybrid) with materially different cost/latency/privacy profiles. Product decision needed before implementation; this ticket holds the proposal until a path is chosen.
**Acceptance Criteria:** (any path)

- [ ] Ghost-text appears after ≥ 3 keystrokes with a debounce of 300–600 ms
- [ ] User can accept (Tab) or dismiss (Esc, or by typing a non-boundary character) without leaving the composer
- [ ] Suggestion never blocks composer input — it is an overlay, not an inline replacement
- [ ] Default off; user must opt in. NSFW chats default to off regardless of preference
- [ ] No suggestion is sent before user has typed ≥ 3 characters; no completion longer than 32 tokens
- [ ] Local-only path ships zero network calls for suggestion lookup
- [ ] Tests cover: prefix matching, accept/dismiss keyboard paths, debounce coalescing, opt-out persistence, NSFW-chat default-off
**Related:** `IDEA-chat-composer-predictive-inline-text-suggestions.md` (original), `src/chat/proactive/` (existing server-event timing, not autocomplete), `TASK-chat-composer-tab-complete-for-commands-mentions-emoji.md` (sibling: structural completions for `/commands` `@mentions` `:emoji:`).

---

## Problem

The chat composer has no inline typing assistance. Other UIs (GitHub Copilot, Gmail Smart Compose, ChatGPT composer) ship ghost-text completion — a low-confidence suggestion that fills the next phrase. Useful or intrusive depends on quality, latency, and how the user can dismiss it.

**Loop-lore has a related module that is NOT this**: `src/chat/proactive/` is server-event timing (when to push a system message), not local text completion. Don't conflate them.

---

## Three implementation paths

### Path A — LLM ghost-text (cloud)

| Concern | Detail |
| --- | --- |
| Mechanism | Debounced 300–600 ms, fire request to chat-LLM provider with prefix + chat-history context, stream back a short completion (≤ 32 tokens). |
| Cost | One small completion per ~5 keystrokes per active user. At 1k DAU that's ~200k completions/day → non-trivial spend. |
| Latency | Streamed; first token ~150–400 ms. |
| Privacy | Prefix + chat history leave the device. Optional per-user disable (default off for NSFW chats). |
| Quality | High when context-rich; degrades to nonsense for short prefixes. |
| Failure modes | Network failures, rate-limit, provider outage, billing enabled but exhausted. |
| Implementation | New Alpine component in `src/frontend/alpine/chat-composer-inline-suggest.ts` + LLM streaming client (reuse `src/generation/providers/stream-buffer.ts`). Backend endpoint at `POST /api/composer/suggest` mounted under Elysia rate-limiter (one suggestion per user per N ms). |

### Path B — Local n-gram over user history (privacy-first)

| Concern | Detail |
| --- | --- |
| Mechanism | Build a per-user n-gram (n=3–5) trie over sent messages. On prefix keystrokes ≥ 3, walk the trie and show the highest-count continuation. |
| Cost | Zero per-request. Build cost is O(messages × n) once at user-sign-in, stored in memory + IndexedDB for next session. |
| Latency | < 5 ms, fully local. |
| Privacy | All local. No network egress for suggestion lookup. |
| Quality | Acceptable for repeated phrases ("I open the", "I walk to the", "She smiles and"); weak for novel content. |
| Failure modes | Cold-start (first-time user has no history); spam from copy-pasted messages. |
| Implementation | New `src/chat/composer/local-suggest.ts` (Web Worker → IndexedDB trie); Alpine wiring in `src/frontend/alpine/chat-composer-inline-suggest.ts`. No backend changes. |

### Path C — Hybrid (local n-gram, optional LLM)

Default to B. User opts in to A per chat. Per-chat toggle persisted in `chats.settings.inline_suggest_mode` (`off` / `local` / `cloud`; default `local` for SFW chats, `off` for NSFW chats).

| Concern | Detail |
| --- | --- |
| Best of both | Fast + private default; quality upgrade available. |
| Cost | Same as A only when user opts in. |
| Implementation | Compose both modules; suggestion picker in Alpine prefers local completion, falls back to LLM after debounce if local confidence < threshold. |

---

## Acceptance criteria (any path)

- [ ] Ghost-text appears after ≥ 3 keystrokes with a debounce of 300–600 ms
- [ ] User can accept (Tab) or dismiss (Esc, or by typing a non-boundary character) without leaving the composer
- [ ] Suggestion never blocks composer input — it is an overlay, not an inline replacement
- [ ] Default off; user must opt in. NSFW chats default to off regardless of preference
- [ ] No suggestion is sent before user has typed ≥ 3 characters; no completion longer than 32 tokens
- [ ] Local-only path (B/C) ships zero network calls for suggestion lookup
- [ ] Tests cover: prefix matching, accept/dismiss keyboard paths, debounce coalescing, opt-out persistence, NSFW-chat default-off

---

## Non-goals (explicit)

- Slash-command autocomplete (`/commands`) — covered by `TASK-chat-composer-tab-complete-for-commands-mentions-emoji.md`
- Emoji autocomplete (`:smile:`) — same sibling ticket
- Mention autocomplete (`@user`) — same sibling ticket
- Server-side proactive message timing — `src/chat/proactive/` (unrelated)

---

## Decision needed

Pick a path:

- **A** (LLM): ships highest quality; highest cost; needs privacy + billing review
- **B** (local n-gram): ships privacy-first; weakest quality; smallest implementation
- **C** (hybrid): most code; best UX long-term; ships both paths

Recommended default: **C with default-on to B only**. User opts into A explicitly. Defer A until B's cold-start complaints justify the spend.

Once picked, decompose into TASK tickets (one per file slice) and a TEST ticket covering the acceptance criteria above. Do not implement against this IDEA directly — file the chosen path as TASK tickets first.
