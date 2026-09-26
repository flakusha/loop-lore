<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Composer "improve my prompt" UI affordance

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Epic:** epic-prompt-improvement.md
**Status:** In Progress
**Priority:** High

## Scope

- `src/components/chat/input-area.html`: add an ✨ Improve button next to the
  send button with a level menu (spellcheck / wording / expand / strict /
  creative / chat style / group style). Shared component → direct chat,
  group chat, and mobile composer all inherit it.
- New Alpine module `src/frontend/alpine/chat-actions/prompt-improve.ts`
  merged into `chatActions`: `improvePrompt(level)` — reads
  `$refs.messageInput`, POSTs to `/api/generation/prompt`, replaces the
  draft on success, keeps the previous draft for one-click undo, surfaces
  failures via the existing toast pattern (`$dispatch("show-toast", …)`).
- Auto-select `style-group` for group chats; `_improving` loading state
  disables the button.
- Command-button row `✨ Improve` (existing `command-buttons.ts` entry)
  keeps working — the slash command now runs the same service.

## Acceptance

- Unit test for the Alpine module (fetch stubbed) asserting draft
  replacement, undo backup, and error toast; no page errors on interaction.

## Clarification 2026-09-26

Current behavior: the affordance SHIPS. `src/components/chat/input-area.html:217-253` has the ✨ button, 7-level menu (spellcheck/wording/expand/strict/creative/style-chat/style-group) + Analyze + Undo, bound to `improvePrompt()` / `restorePromptDraft()` with `:disabled="!activeChat || _improving"`. `src/frontend/alpine/chat-actions/prompt-improve.ts:45-135` implements `improvePrompt` (group chats default to `style-group`, line 72-73; `_improving` guard line 62; `_promptImproveBackup` line 113; toasts lines 64/104/116/118) and `restorePromptDraft`. POSTs to `/api/v1/generation/prompt`.

Scope disambiguation: two stale references. (1) Ticket scope says the module is "merged into `chatActions`" — the `chatActions` object in `chat-actions/index.ts:12-21` has no prompt entries; the actual merge is the spread `...promptImproveActions` in `chat/bootstrap.ts:87` (sibling `...promptAnalyzeActions` at :88). (2) Route path is `/api/v1/generation/prompt` (live call `prompt-improve.ts:86`, mount `controller.ts:129` under default prefix `/api/v1` per `controller.ts:66`, confirmed by the sole v1 wiring `content-surface.ts:34,37`; no unversioned `/api/generation/*` route string exists anywhere in `src/`), not `/api/generation/prompt` as the ticket scope states. A third stale reference of the same class — the `POST /api/generation/prompt` comment in `improve.ts:12` — is covered by the `CLARIFY-prompt-improve-route-path-reconciliation` follow-up (issue `e1f77a8`), which also owns `prompt-route.ts:7`.

Scoped next step: ticket acceptance (unit test: draft replacement, undo backup, error toast) is covered by `prompt-improve-local.test.ts:89-161` + `prompt-improve-model.test.ts` — run both files green, fix the two stale path references, then close. Related open git issues: `8a3b90e` (slash-autocomplete regex swallows Enter — same composer input surface), `242efba` (chat normal startup bypass).

Acceptance:

- [ ] `bun test src/frontend/alpine/chat-actions/prompt-improve-local.test.ts src/frontend/alpine/chat-actions/prompt-improve-model.test.ts` green
- [ ] Stale `/api/generation/prompt` + `chatActions`-merge references corrected
- [ ] No page errors on Improve/Undo interaction (manual smoke)
