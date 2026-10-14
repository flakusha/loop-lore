<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Waive seven diff-scoped coverage floors surfaced by JSDoc-only documentation

**Status:** Not Started
**Priority:** medium
**Effort:** Large

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
