<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Branch-merge service and criteria engine

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-conversation-branching
**Tags:** branch-merge

**Summary:** `src/chat/service/merge/` — merge graph/LCA, the mode criteria engine, deterministic overlay diff, LLM prompt assembly + token budget, persistence and orchestration for the content merge.
**Context:** Branch-merge design §3.1/§2/§3.3/§3.5: graph reuses `walkMessagePath` (`src/chat/service/branch-helpers.ts:29-52`) and mirrors the walk-ceiling pattern of `MAX_MERGE_NODES` (`src/chat/service/branch-merge.ts:49`); system prompt via the `resolveSystemPrompt` pattern (`src/chat/transition-classifier.ts:104-110`); Result-style returns from `src/chat/service/types.ts`; initiate idempotency mirrors the pending-replay in `regenerateMessageVariant` (`src/chat/service/write.ts:97-119`).
**Acceptance Criteria:** Mode engine, graph, diff, LLM+budget and store land per design §2/§3.1–§3.5 with idempotent initiate, strict-TS Result returns and barrel export.
**Related:** FEAT-046.md, FEAT-047.md, FEAT-message-swipe-replay-branch.md

## Summary

New directory `src/chat/service/merge/` (options-object params, strict TS, no `any`), barrel-exported from `src/chat/service/index.ts`:

| File | Responsibility |
| ---- | -------------- |
| `merge-graph.ts` | Load each source tip, walk `parent_id` to root via `walkMessagePath`, compute the LCA (`base_message_id`), produce per-source tails (divergence→tip), reject oversized walks at the node ceiling. |
| `merge-criteria.ts` | `MergeMode` const + discriminated union of per-mode preview/confirm option types; per-mode classification (`llm` vs `overlay`); system-prompt keys; output contract types. |
| `merge-diff.ts` | Deterministic LCS line diff + three-way overlay (shared prefix = ancestor) producing `{ kept, applied, conflict }` hunks for the overlay modes — no new dependency. |
| `merge-llm.ts` | Prompt assembly + LLM call + safe parse; system prompt from config templates with a built-in fallback so a missing template never 500s; output shape-validated to `{ role, content }[]`. |
| `merge-store.ts` | Kysely persistence for `branch_merges` / `branch_merge_sources` / result-row inserts (swipe-race protected). |
| `merge-service.ts` | `initiateMerge` / `buildPreview` / `confirmMerge` / `continueFromMerge` orchestration. |

Mode semantics (persisted verbatim in `branch_merges.mode`; ordinal = array index):

- `combined` — weave both versions into one continuation; strongest beats of each; contradictions resolved deliberately (LLM + manual edit).
- `second-over-first` — the ordinal-0 branch is the BASE; the second branch's modifications overlay onto it (deterministic diff, LLM only for conflicting hunks).
- `first-over-second` — inverse: the second branch is the base, the first branch's modifications apply onto it.
- `fresh-discovery` — write a NEW continuation aware of both setups that explicitly does not follow either approach; originals leave the active line (LLM).
- `single-plus-glean` — keep the ordinal-0 branch nearly verbatim, graft slight improvements from the others; changed-lines guard, over-threshold output flagged in the preview rather than accepted silently.

Prompt strategy: delimited user content (`SHARED CONTEXT` common-ancestor tail, `VERSION A`/`VERSION B` per ordinal, mode instruction block); output contract is a JSON array parsed with the repo safe-JSON pattern — parse failure returns `merge_llm_parse` with no partial writes and a reusable draft. Overlay modes send only conflicting hunks to the LLM with a no-silent-base-side fallback (manual resolution always possible). Token budget: shared-prefix-first allocation, per-version remainder split evenly, head+tail keep on version overflow with `truncated: true`, hard `bad_request` when the shared prefix alone overflows.

Idempotency: initiate replays an existing draft on a repeated key (`uq_branch_merges_idem`, `replayed: true`); preview generation attempts keyed `merge:preview:<mergeId>[:n]`.

## Acceptance Criteria

- [ ] `MergeMode` const + per-mode option types in `merge-criteria.ts`; mode values persist verbatim
- [ ] `merge-graph.ts` computes LCA + per-source tails via `walkMessagePath` and rejects oversized walks at the node ceiling
- [ ] `merge-diff.ts` produces kept/applied/conflict hunks with no new dependency
- [ ] `merge-llm.ts` builds the delimited prompt, safe-parses the JSON contract, and returns `merge_llm_parse` on failure without partial writes
- [ ] Token budget: shared-prefix-first, head+tail on version overflow with `truncated` flag, hard reject when the prefix alone overflows
- [ ] `initiateMerge` replays a repeated idempotency key as `replayed: true`
- [ ] Results are `{ ok: true, … } | ServiceError` with options-object params and `@throws` JSDoc where functions throw
- [ ] Barrel export added to `src/chat/service/index.ts`
