<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Waive seven diff-scoped coverage floors surfaced by JSDoc-only documentation

**Status:** In Progress
**Priority:** medium
**Effort:** Large
**Epic:** (none — hygiene/self-contained)

**Summary:**

Seven modules already sit below their coverage floor on dev. Branch fix-jsdoc-contracts documents them (JSDoc only, zero executable-line changes), which pulls them into the diff-scoped coverage gate via SCOPED_DIFF_SRC_FILES, which filters by path shape and never asks whether the diff changed code. The percentages are identical on dev; nothing regressed.

Affected (pct / floor):

- routes:src/routes/http-utils/redirect.ts 50.0 / 80
- services:src/services/server-external-manager/index.ts 45.0 / 78
- routes:src/routes/views/view-serving.ts 63.8 / 80
- story:src/story/world-state/index.ts 66.7 / 80
- routes:src/routes/views/static-partials.ts 68.4 / 80
- transport:src/transport/compression.ts 76.7 / 80
- rpg:src/rpg/replayability/service/index.ts 78.1 / 80

WORK ITEM (the real value, not this waiver): raise these seven modules toward the floor. server-external-manager/index.ts at 45% is genuinely under-tested and is the strongest candidate for real test work. Delete each waiver in waivers.mjs as its module recovers. A waiver that outlives its ticket is how that file rots, so each waiver entry must be removed when the module crosses back over.

SEPARATE PROPOSAL, deliberately NOT done in the documentation branch: gate --diff-base scope on changed CODE rather than changed PATHS. As written, SCOPED_DIFF_SRC_FILES (scripts/check/parallel/context.mjs) floors any touched src file even when the diff is comment-only, so documentation work cannot pass the coverage gate without tests it does not call for. This is the same blind spot WS-8 fixed on the size gate, which counts code lines only. That change belongs in its own branch with its own review; loosening a gate in the same change that unblocks it is the move that deserves scrutiny.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Coverage evidence (2026-10-23)

Five of the seven per-file waivers were deleted from
`scripts/check/coverage/waivers.mjs`; the two that still measure below their
floor are kept. Measured on dev (branch `cov-waiver-salvage`), each file in
its top-level module scope.

| file | module scope | LF | LH | % | floor after deletion | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| src/routes/http-utils/redirect.ts | src/routes | 2 | 2 | 100.0 | 80 | PASS — waiver deleted |
| src/story/world-state/index.ts | src/story | 40 | 40 | 100.0 | 80 | PASS — waiver deleted |
| src/routes/views/static-partials.ts | src/routes | 21 | 20 | 95.2 | 80 | PASS — waiver deleted |
| src/transport/compression.ts | src/transport | 78 | 77 | 98.7 | 80 | PASS — waiver deleted |
| src/rpg/replayability/service/index.ts | src/rpg | 34 | 34 | 100.0 | 80 | PASS — waiver deleted |
| src/services/server-external-manager/index.ts | src/services | 60 | 27 | 45.0 | 78 | FAIL — waiver kept (floor 45) |
| src/routes/views/view-serving.ts | src/routes | 106 | 67 | 63.2 | 80 | FAIL — waiver kept (floor 63) |

The ticket stays open: server-external-manager/index.ts (45.0%) and
view-serving.ts (63.2%) are still below their floors and still need real test
work.
