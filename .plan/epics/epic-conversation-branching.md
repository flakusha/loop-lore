<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Conversation Branching

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** chat, branching, tree-history, alternative-flows
**Overview:** (see sections below)


## Overview

Enable draft/alternative flows via tree-structured message history. Allows users to explore different conversation paths and merge branches back to the main thread.

## Reference

- Future features plan: `.plan/future-features-plan.md` (Tier 2)

## Features

| Feature           | ID           | Effort | Description                                               |
| ----------------- | ------------ | ------ | --------------------------------------------------------- |
| Branch navigation | FEA-2026-045 | Low    | `parent_id` already in schema; add tree traversal queries |
| Branch UI         | FEA-2026-046 | Med    | Visual branch selector in chat view                       |
| Branch merge      | FEA-2026-047 | Med    | Merge alternative branches back to main thread            |

Content-merge task files for FEA-2026-047 (dependency order):


- `TASK-branch-merge-db-migration-039.md` — merge-record schema
- `TASK-branch-merge-service-and-criteria-engine.md` — merge service + mode engine
- `TASK-branch-merges-routes-and-typebox-schemas.md` — HTTP surface
- `TASK-branch-merge-frontend-wizard-ui.md` — merge wizard UI
- `TASK-branch-merge-continuation-semantics.md` — synthetic branch + continue flow
- `TASK-branch-merge-tests-and-coverage.md` — service, route and frontend tests

## Branch Merge Process (content merge)

### Overview

A **content merge** fuses two or more conversation branches (or sibling swipe
variants at one message position) into ONE continuation — an LLM-assisted
and/or manually edited fused conversation — and the chat continues from the
merge point. It is distinct from the already-implemented structural
splice-merge `mergeBranch` (`src/chat/service/branch-merge.ts`), which
re-parents a source subtree, advances the target tip and DELETES the source
branch; that endpoint (`POST /api/v1/chats/:id/branches/:branchId/merge`) and
its semantics stay untouched.

Content merge gets its own resource — `POST /api/v1/chats/:id/branch-merges`
plus `…/preview`, `…/confirm`, `…/continue` — so the structural and content
flows never share an endpoint name or a delete-vs-keep contract. Decision:
sources are **never deleted** on a content merge (provenance and later
re-merge); only the display pointer moves, which also removes the
splice-merge's "cannot merge the active branch" constraint.

### Merge modes

`MergeMode` — persisted verbatim in `branch_merges.mode`:

| Mode | Kind | Semantics |
| ---- | ---- | --------- |
| `combined` | LLM (+ manual edit) | Both branch versions woven into one continuation; strongest beats of each; contradictions resolved deliberately. |
| `second-over-first` | deterministic overlay + LLM for conflicts | First branch (ordinal 0) is the BASE; the second branch's modifications are applied onto it. |
| `first-over-second` | deterministic overlay + LLM for conflicts | Inverse of `second-over-first`: second branch is the base; first's modifications applied onto it. |
| `fresh-discovery` | LLM | Generate a NEW continuation aware of both branches' setups, with EXPLICIT drop of both previous approaches (both originals discarded from the active line). |
| `single-plus-glean` | LLM (guard-railed) | Keep a single branch (ordinal 0) essentially verbatim; graft slight modifications from the others. |

Sources store an explicit `ordinal` ("first" = 0, "second" = 1) in
`branch_merge_sources`, so the ordinal-sensitive modes are stable regardless
of selection order.

### Database — forward migration `046_conversation_merge.ts`

- `branch_merges` — one row per merge: `chat_id`, `base_message_id` (the
  lowest common ancestor), `mode` CHECK (`combined`, `second-over-first`,
  `first-over-second`, `fresh-discovery`, `single-plus-glean`), `status` CHECK
  (`draft`, `confirmed`, `discarded`), `result_message_id`, `merged_branch_id`,
  `created_by`, `idempotency_key`, `metadata` (preview digest, hunks, token
  estimates, truncation flags), `created_at` / `confirmed_at`.
- `branch_merge_sources` — parentage join: PK `(merge_id, ordinal)`,
  `tip_message_id`, nullable `branch_id` (a bare swipe tip has no
  `chat_branches` row).
- `messages.merge_id` — nullable backref to `branch_merges` (badges,
  regeneration scoping); the message tree stays single-parent.
- Indexes: `idx_branch_merges_chat` `(chat_id, created_at)`;
  `uq_branch_merges_idem` partial-unique `(chat_id, idempotency_key)` where
  the key is set; `uq_branch_merge_sources_tip` `(merge_id, tip_message_id)`;
  `idx_messages_merge` `(merge_id)`.
- `down()` is loss-tolerant: it drops provenance (backref column, sources,
  merges — indexes first); confirmed merges keep their message rows and
  synthetic branch rows as plain data.

### Continuation semantics

- Result rows are inserted as **children of the LCA** (`base_message_id`),
  carrying `messages.merge_id` and idempotency key
  `merge:<mergeId>:<ordinal>`; swipe-slot protected via
  `retryBounded`/`isSwipeIndexUniqueViolation` (`src/utils/swipe-retry.ts`).
- A **synthetic `chat_branches` row** rooted at the merged tip becomes active:
  demote the other `is_active` rows and repoint `chats.active_branch_id` in
  the same fork/switch lockstep as `forkBranch`
  (`src/chat/service/branches.ts`).
- Sources are NOT deleted; branch navigation sees
  `root → … → LCA → merged… → new`, and the composer parents the next message
  on the displayed (merged) tip after reload
  (`src/frontend/alpine/chat-send.ts`).

### Frontend

- Entry points: branch panel multi-select + "Merge…" toolbar button (selection
  order defines the ordinal), variants-browser "Merge variants…" (sibling
  tips — the degenerate branch merge), context menu "Merge from here…".
- Wizard modal `src/components/chat/branch-merge-modal.html`, four steps:
  sources review → mode picker → preview/diff (editable draft for LLM modes;
  Base / Overlay / Edit-inline per conflict for overlay modes, unresolved
  conflicts block confirm) → confirm (synthetic-branch name, activate toggle,
  continue CTA).
- Alpine wiring: `src/frontend/alpine/chat-branch-merge.ts` + state types
  `src/frontend/alpine/chat-types/merge-state.ts`, transient modal state on
  `$store.ui`, window globals via `callChatStateAction`/`awaitChatStateAction`
  (the `chat-branches.ts` pattern); i18n keys under `branches.merge*` added to
  every locale file under `src/public/locales/`.

### Key edge cases

| Case | Handling |
| ---- | -------- |
| Unequal branch depths | Tails are divergence→tip per source; the LCA is the attach base; a source whose tip IS the LCA (empty tail) → `bad_request` "source has no divergent messages" (mirrors `mergeBranch`'s empty-subtree refusal in `src/chat/service/branch-merge.ts`). |
| Merge of merges | A confirmed merge's synthetic branch is an ordinary `chat_branches` row and can be a later merge's source; draft merges cannot (status guard). |
| Token budget | Shared-prefix-first allocation; an oversized version keeps head+tail with `truncated: true` surfaced in the preview; shared prefix alone over budget → hard `bad_request` reject, never silent truncation. |
| Concurrent confirms | Guarded `status='draft'` UPDATE (rowcount 1) inside the confirm transaction; concurrent confirm → HTTP 409 conflict. |
| Down-migration | Loss-tolerant: confirmed merges keep their message rows and synthetic branch rows; drafts and provenance links drop. |

## Acceptance Criteria

- [ ] Branch navigation queries work on existing `messages.parent_id`
- [ ] Visual branch selector implemented in chat view
- [ ] Branch merge functionality works without data loss
- [ ] Content merge (FEA-2026-047) lands per the task files listed under Features: preview → confirm → continue with source branches preserved

## Dependencies

- Messages schema (existing `parent_id` field)


## Related

- `.plan/tickets/FEAT-046.md` — branch navigation API, including the structural splice-merge endpoint that consumes the source branch (untouched by the content merge).
- `.plan/tickets/FEAT-047.md` — branch UI controls; merge-confirmation modal precedent for the merge wizard.
- `.plan/tickets/FEAT-message-swipe-replay-branch.md` — swipe/replay variant creation; merging sibling tips at one position is the degenerate branch merge.


## Integration Points

### Systems This Epic Depends On

<!-- Systems whose output this epic consumes -->

| System | What It Provides | How Used |
| ------ | ---------------- | -------- |
| Messages Pipeline | `messages.parent_id`, content metadata | Tree traversal queries start from existing schema |
| Lore/Memory Systems | Episodic memory writes | Branch divergence may produce parallel memory tracks |
| Chat Lifecycle | Chat session state, branching context | Branches live inside an existing chat session |

### Systems That Depend On This Epic

<!-- Systems that consume this epic's output -->

| System | What It Consumes | How Used |
| ------ | ---------------- | -------- |
| Conversation Branching UI | Branch tree, merge result | Render branch selector + merge controls |
| Context Injection | Active branch path | Context window selection for LLM |
| Search / Retrieval | Branch-scoped message IDs | Filter search results to a chosen branch |

### Shared Data Contracts

<!-- Types, interfaces, or schemas shared between this and other systems -->

| Contract | Shared With | Purpose |
| -------- | ----------- | ------- |
| `parent_id` (existing) | Messages | Branch tree key |
| `BranchNode` (new) | UI, Context Injection | Branch representation passed to consumers |

### Cross-System Events

<!-- Events this system emits or subscribes to from other systems -->

| Event | Direction | Purpose |
| ----- | --------- | ------- |
| `branch.created` | emits → UI, Memory | New branch diverged |
| `branch.merged` | emits → Context Injection, Search | Branch selected as active |
