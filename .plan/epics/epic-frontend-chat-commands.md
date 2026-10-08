<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Frontend Slash Commands (`/...`) for Chat, Group Chat, Assistant

**Priority:** medium
**Effort:** Medium
**Type:** epic
// hint: Cosmetic change on both sides. Pick either version or combine formatting.
**Tags:** chat, slash-commands, composer, autocomplete, command-palette, assistant-flows, group-chat
**Overview:** Unified `/...` slash-command UX for direct chat, group chat, and assistant sessions: a server-backed command palette hydrating from the live assistant registry, keyboard-navigable autocomplete with did-you-mean, role-filtered `/help`, toggleable pre-send markdown preview, and Tab-accept parity across commands/mentions/emoji.


**Status:** In Progress

**Status Note:** Palette shipped and server-backed (`src/frontend/alpine/chat-actions/command-palette.ts` hydrating from `GET /api/v1/commands`; `src/routes/commands/` mounted via `src/routes/v1/admin-surface.ts`); caret-anchored `/`-token popover (`src/frontend/alpine/slash-autocomplete.ts`) coexists with the legacy palette — both registry-driven. Markdown pre-render (`src/frontend/alpine/chat-utils/render.ts`) + toggleable pre-send preview (Ctrl+Shift+P, `composer-pre-send.ts`) Done; Tab-accept/Shift-Tab/Esc Done (`chat-group.ts`). 2026-10-08: `/help` now filters by caller `roleInChat` (owner-gated commands hidden from members); did-you-mean fallback (`didYouMeanCandidate`) in both palette surfaces. `TASK-slash-commands-chat-group-assistant.md` remains Not Started.
**Area:** Frontend composer + assistant continuation flows

## Scope

- Unified `/...` command registry for direct chat, group chat, and
  assistant sessions: discovery list, prefix matching, arg hints,
  permission gating (user/mod/admin/GM).
- Assistant work continuation: `/continue`, `/branch`, `/retry`-style
  flows resume prior assistant state instead of starting fresh; chat and
  group variants share the registry with different capability sets.
- Composer UX: `/` autocomplete popup (keyboard navigable), inline help,
  unknown-command toast with did-you-mean. No backend command execution
  changes — frontend dispatch only.

## Tickets

- `TASK-slash-commands-chat-group-assistant.md` - Not Started (umbrella: registry scope/role metadata, assistant continuation, group mention-aware variants)
- `TASK-chat-composer-markdown-pre-render-preview-before-send.md` - Done (toggleable preview, Ctrl+Shift+P, no behavior change at defaults)
- `TASK-chat-composer-tab-complete-for-commands-mentions-emoji.md` - Done (Tab-accept top suggestion, Shift-Tab cycle, Esc dismiss)

## Acceptance

// hint: Structural and logic conflict. Both design and behavior differ.
- [x] Same live registry drives the palette and both autocomplete surfaces (`GET /api/v1/commands` → `listCommands()`); new commands appear without an FE rebuild.
- [x] `/help` lists only commands the caller's `roleInChat` satisfies (owner-gated `/attack`, `/battle`, `/create`, `/debug`, `/heal` hidden from members); unrestricted commands always listed.
- [x] Unknown-command typos surface a did-you-mean suggestion in the palette (`/hep` → `/help`); explicit Tab/Enter to accept, Esc dismisses; unrelated input still yields no candidates.
- [ ] Disallowed commands hidden with explanation, not silent failure — backend denies with a `Permission denied` system message; the palette itself cannot yet role-filter (no per-chat scope on `GET /api/v1/commands`; FE holds no participant role). Options: extend the endpoint with an optional `chatId` returning `requiredRole` per entry, or filter client-side once the FE learns the participant role.
- [ ] Assistant `/continue` after reload resumes, not restarts, the flow — `/continue`, `/branch`, `/retry` are not registered commands; covered by the umbrella ticket.
- [ ] Group-chat mention-aware variants (`/roll`, `/poll`) — `/roll` exists; `/poll` is unregistered; moderation-gated commands defer to `TASK-moderation-actions-frontend`.
- [ ] `BUILTIN_COMMANDS` in `src/assistant/command-parser.ts` is a stale static list (missing `attack`, `battle`, `quest`, `workflow`, GM-guidance verbs, etc.) used only by `isBuiltinCommand`, which has no production callers outside the barrel re-export — delete it or regenerate from the registry when touching the parser.


## Spec Alignment

- `docs/frontend/chat/commands-and-misc.md` — palette behavior, fuzzy prefix
  match, per-context capability filtering, and keyboard navigation this
  registry implements.
- `docs/frontend/chat/input.md` — composer toolbar extension point hosting
  the `/` autocomplete popup.
- `docs/frontend/chat/group-chat.md` — role definitions gating which
  commands each composer exposes.

## Integration Points

### Systems This Epic Depends On

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Emoji Reactions (`epic-frontend-emoji-reactions.md`) | `:name:` autocomplete registry | Shared composer popup, Tab-accept parity |
| Frontend Components | Composer markup | `src/components/chat/input-area.html` |
| Assistant / GM flows (`epic-assistant-gm-flows.md`) | Continuation commands | `/continue`, `/branch` (unregistered — umbrella ticket) |
| Impersonation (`epic-impersonation.md`) | `/impersonate`, `/char` commands | `impersonate-toggle` / `impersonate-select` actions dispatched via `dispatch.ts` |
| Group Chat (`epic-group-chat.md`) | Mention-aware command variants, turn orchestration | `/roll` exists; `/poll` unregistered; addressed slash (`@Name /cmd`) via `stripLeadingMention` |

### Systems That Depend On This Epic

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Emoji Reactions (`epic-frontend-emoji-reactions.md`) | Shared trigger registry | One autocomplete popup, Tab-accept parity |
| Impersonation (`epic-impersonation.md`) | Palette discovery for `/impersonate`, `/char` | Registered commands surface in palette + `/help` |
| Group Chat (`epic-group-chat.md`) | Shared registry + palette | Mention-aware dispatch, composer UX |

### Shared Data Contracts

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| Command registry (`src/frontend/alpine/chat-actions/command-palette.ts`, `src/frontend/alpine/slash-autocomplete.ts`, `GET /api/v1/commands` → `listCommands()`) | Emoji Reactions, group chat | Permission-gated command dispatch, did-you-mean (`didYouMeanCandidate`) |

### Cross-System Events

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| — | — | Frontend dispatch only; no backend command execution |


## Related

- `epic-frontend-emoji-reactions.md` — shared composer autocomplete registry (one popup, `/` + `:` triggers, Tab-accept parity).
