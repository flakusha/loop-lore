<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Branch-merge frontend wizard UI

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-conversation-branching
**Tags:** branch-merge

**Summary:** Merge wizard UI — `branch-merge-modal.html` (sources → mode → preview/diff → confirm), its entry points, and the Alpine/state/i18n wiring.
**Context:** Branch-merge design §5 + research §5: partial mounts like `branch-list-panel.html` (reads `$store.ui` + window helpers); pure Alpine + `apiFetch` mutation pattern (`src/frontend/alpine/chat-branches.ts:44-67`); variant data from the stateless `GET /api/v1/messages/:id/variants` (`src/routes/messages/read.ts:129-200` — no persisted selection exists); state composed like `chatBranches` (`src/frontend/alpine/chat-types/branches-state.ts`, bootstrapped in `src/frontend/chat/bootstrap.ts`); locales carry the `branches.*` block (`src/public/locales/en.json`).
**Acceptance Criteria:** Wizard + all entry points wired through the existing mutation/bridge patterns, non-2xx toasts without state mutation, locale keys present in every locale file.
**Related:** FEAT-046.md, FEAT-047.md, FEAT-message-swipe-replay-branch.md

## Summary

- Entry points: branch panel multi-select checkboxes + "Merge…" toolbar button (selection order defines the ordinal, shown as ordinal badges); variants-browser "Merge variants…" (sibling tips, `branchId` null); context menu "Merge from here…" pre-seeding the source list.
- `src/components/chat/branch-merge-modal.html` — server-rendered partial, single `x-data` state machine (factory-function state), steps:
  1. Sources review — branch name, tail preview, message count, per-position variant picker (`GET /api/v1/messages/:id/variants`), reorder buttons.
  2. Mode picker — a radio card per merge mode (`branches.mergeMode.*`: title, one-line description, AI-assisted/deterministic tag), token-estimate chip, truncation/conflict warnings.
  3. Preview / diff — overlay modes: inline line-diff with kept/applied/conflict hunks, per-conflict Base/Overlay/Edit-inline, unresolved conflicts block confirm; LLM modes: editable draft textareas, a changed-lines meter for `single-plus-glean`, "Re-roll" → `preview { regenerate: true }`.
  4. Confirm — branch name (default "Merged <n>", max `MAX_BRANCH_NAME_LENGTH`), activate toggle (default on), summary; success → toast + `loadBranches()` + `loadMessages()`; "Continue from here" CTA → continue endpoint.
- `src/frontend/alpine/chat-branch-merge.ts` + `src/frontend/alpine/chat-types/merge-state.ts` (`ChatMergeState` on `ChatState`, composed in `chat-types/chat-state.ts`, bootstrapped in `src/frontend/chat/bootstrap.ts`).
- Transient modal state (`mergeModalOpen`, `mergeDraft`) on `$store.ui` (`src/frontend/stores/ui-store.ts`); window globals via `callChatStateAction`/`awaitChatStateAction`; non-2xx → error toast, no state mutation (the `mutateBranch` contract).
- i18n: `branches.mergeMode.*`, `branches.mergeStep.*`, `branches.mergeConflict.*` added to EVERY locale file under `src/public/locales/`.

## Acceptance Criteria

- [ ] Branch panel multi-select, variants-browser button and context-menu entry all open the wizard
- [ ] Every wizard step works end-to-end against initiate/preview/confirm/continue
- [ ] Unresolved overlay conflicts block confirm; edited LLM drafts submit as `content`
- [ ] Confirm success reloads branches + messages; the continue CTA fires the continue endpoint
- [ ] Non-2xx responses toast without mutating local state
- [ ] Locale keys present in every locale file under `src/public/locales/`
- [ ] Alpine module tests follow the chat-variants/chat-branches patterns (see `TASK-branch-merge-tests-and-coverage.md`)
