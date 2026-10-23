<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: coverage waiver for chat/service/ownership.ts (bun async-body tracking limit)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** Medium
**Effort:** Small
**Epic:** (none — hygiene/self-contained)

`scripts/check/coverage.mjs` floors `src/chat/service/ownership.ts` at 60 (per-file waiver under key `chat:src/chat/service/ownership.ts`) because bun's coverage tool cannot reliably track hits on lines inside async function bodies. The 16-test suite (`bun test ./src/chat/service/ownership.test.ts`) exercises every branch (concurrent loser, autoInvite true/false, settings-check failure, actorExists probe, etc.) but bun counts the trx-body lines as uncovered. Refactor extracted helpers (`executeTransferTx`, `runPostTransferHooks`, `interpretTransferError`) and flattened multi-line returns to single-line consts — coverage improved 62.5% → 64.97% but the structural limit caps further gains. Floor 60 matches the achieved coverage with headroom; remove the waiver if bun coverage ever tracks async-body lines correctly.

## Acceptance Criteria

- [ ] Per-file waiver entry present in `scripts/check/coverage.mjs` (key `chat:src/chat/service/ownership.ts`, floor 60)
- [ ] `floorFor(mod, file)` accepts per-file override and is called from diff-file mode
- [ ] Diff-scoped coverage gate (`coverage - per-module line %` with `--diff-base dev`) passes green
- [ ] `bun test ./src/chat/service/ownership.test.ts` passes 15/16 (1 skip pre-existing)
- [ ] Removal plan documented in waiver entry comment (upgrade path: bun coverage supports async-body tracking)

## Coverage evidence (waiver deleted 2026-10-23)

The per-file waiver `chat:src/chat/service/ownership.ts` (floor 60) was deleted
from `scripts/check/coverage/waivers.mjs`. Measured on dev (branch
`cov-waiver-salvage`):

- file: src/chat/service/ownership.ts
- module scope: src/chat (every test under the top-level module)
- LF=148, LH=140 -> 94.6%
- floor that applies after deletion: 80 (no `chat` module waiver)
- verdict: PASS

The bun async-body tracking limit this ticket was filed against no longer caps
the file below the floor.
