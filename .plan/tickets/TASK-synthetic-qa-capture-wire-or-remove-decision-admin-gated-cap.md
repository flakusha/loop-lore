<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Synthetic QA capture: wire-or-remove decision, admin-gated capture endpoint + export

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-synthetic-capture-wire-or-remove
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Context

First ticket of epic-synthetic-capture-wire-or-remove.md (decision epic). `src/story/synthetic/` (QA-case generator + runner, `types.ts:5-16`) + the `synthetic_data` table with a full status machine (`src/db/enums-story/synthetic.ts:38-41`, `src/db/migrations/001_init.ts:3195-3196`) have NO production caller — only cleanup references (`src/chat/service/batch.ts:91`, `src/chat/crud/delete.ts:44`) and a stale comment (`src/db/enums-story/turns.ts:38-39`). Either it becomes the labeled-corpus feeder for `eval:prompts` and the future judge-runner, or it is dead weight to delete — the epic forces the decision.

Boundaries: stub `8acbfc2` FEAT-synthetic-fine-tune-data-export targets *fine-tune* export, not eval wiring — this epic absorbs its scope (do not implement 8acbfc2 separately; it is referenced, not closed here). `9e6932e` (dev-harness ground-truth suites) is different scope; `37299f7` (judge runner) and `9ef32dd` (RAG golden sets) are declared consumers of the corpus this ticket would supply.

Epic: epic-synthetic-capture-wire-or-remove.md.

## Summary

(a) Decision: wire vs remove, with a written recommendation. On "wire": (b) admin-gated capture seam — run the synthetic generator on a chat -> store a `synthetic_data` row with status `generated`; (c) export command converting validated rows into `EvalFixture`-shaped JSON (`corpus.ts:23-34` encodings) for the `eval:prompts` runner and later judge-runner corpora; (d) curation pass using the already-modeled validate/reject state transitions. On "remove": delete `src/story/synthetic/`, the table (forward drop migration) and cleanup references.

## Acceptance Criteria

- [ ] Decision recorded in the epic with a recommendation (wire vs remove).
- [ ] On wire — `POST /api/admin/chats/:id/synthetic-capture` (admin role) stores a `synthetic_data` row with >= 1 `SyntheticCase` (`src/story/synthetic/types.ts:10-16`).
- [ ] Chat deletion still removes rows (existing behavior `delete.ts:44` — regression test).
- [ ] Export emits fixture JSON whose labels use exactly the encodings documented in `corpus.ts:13-18` (guards the drift class tracked in `e1db6df`).
- [ ] Exported fixtures run green through `bun run eval:prompts` in mock mode (`src/aux-pipeline/eval/env.ts`).
- [ ] No changes to the generation path (capture is off-loop, admin-triggered).

## Caveats

- [ ] Authorization: admin role gate on the capture endpoint.
- [ ] Rollback: on remove, forward drop migration must not touch live `synthetic_data`-adjacent tables.
- [ ] Observability: capture/export counts logged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
