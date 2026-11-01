<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Synthetic QA Capture — Wire or Remove

**Effort:** Small
**Type:** epic
**Tags:** eval, ground-truth, synthetic-data, decision
**Overview:** (see sections below)


**Status:** Not Started
**Status Note:** Not Started
**Priority:** Low

## Summary

Decision epic: wire vs remove the orphaned synthetic QA pipeline. The repo contains a complete but orphaned capture pipeline: `synthetic_data` table + status machine (`001_init.ts:3195-3196`, `src/db/enums-story/synthetic.ts:38-41`) and generator/runner (`src/story/synthetic/`), with zero production callers (grep: only cleanup references `src/chat/service/batch.ts:91`, `src/chat/crud/delete.ts:44` and a stale comment `src/db/enums-story/turns.ts:38-39`). The eval principle's actual bottleneck is labeled data from real RP traffic — either this becomes the corpus feeder or it is dead weight to delete; the epic forces the decision and lands the outcome.

## Scope

- (a) Decision ticket (wire vs remove) with a written recommendation.
- On "wire": (b) admin-gated capture seam (run the synthetic generator on a chat → `synthetic_data` row with status `generated`); (c) export command converting validated rows into `EvalFixture`-shaped JSON (`corpus.ts:23-34` encodings) for the `eval:prompts` runner and later judge-runner corpora; (d) curation pass using the already-modeled validate/reject transitions.
- On "remove": delete `src/story/synthetic/`, the table (forward drop migration) and cleanup references.

## Related Epics / Boundaries

- Stub `8acbfc2` (FEAT-synthetic-fine-tune-data-export, Not Started, Low, empty "--label" stub): targets *fine-tune* export, not eval wiring — **absorbed by this epic's scope**; referenced here, deliberately NOT closed or modified by this promotion.
- `9e6932e` (TASK-HARNESS-EVAL-HARNESS) — ground-truth suites for the dev agent harness, not runtime RP data: different scope.
- `37299f7` (judge runner) / `9ef32dd` (EPIC-RAG-EVALUATION-OBSERVABILITY, RAG golden sets) — declared consumers of the labeled corpus this epic would supply (dependency, not duplication).

## Tickets

- `TASK-synthetic-qa-capture-wire-or-remove-decision-admin-gated-cap` (`de50ac4`, Low) — decision with recommendation; on wire: admin-gated capture endpoint + export (5 ACs per research doc).

## Open Questions

- Wire vs remove itself — the blocking decision this epic exists to record (recommendation due in the first ticket).
