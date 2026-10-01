<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Audit new test files for cross-file process collisions before they reach dev

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

On 2026-10-01 a review + finalize sweep over ~13 unmerged worktrees surfaced this. It was NOT a regression introduced by the sweep — it is a pre-existing condition observed while diagnosing an unrelated flaky e2e assertion. Evidenced by baseline comparison: a throwaway `git clone --shared --branch dev` at 9198f57eb passed the full 35-file browser suite 6/6, the branch worktree passed single-file 3/3, and the failing assertions also reproduced on a plan-only branch that touches nothing in `src/`.

Derived from the 2026-10-01 finalize sweep. Two consecutive test additions landed suites that were green in isolation and red in a shared process:
1. `src/image-edit/providers/comfyui-owner.test.ts` — `mock.module('../../generation/providers/comfyui', ...)` at :84 is dead, because `src/image-edit/routes.ts:17` statically imports `ComfyUIEditProvider`, which binds `ComfyUIClient` at module-eval time (`comfyui-provider.ts:17`), before `beforeAll` runs. The route-level test hit the real client: `Failed to discover ComfyUI nodes / Unable to connect`, Expected 200 / Received 500 at :161. Underlying pattern: `mock.module` cannot intercept a statically-imported binding that another test file in the same process already evaluated.
2. `scripts/check-parallel.gates.test.mjs` asserts the runner registers 27 gates while the registry has 29. That file is run by NO registered gate, so the mismatch is invisible to CI. Either register it or fold the assertion into an existing gate.

Deliverable: a documented pre-merge check (or a review checklist item) that runs each new or modified test file TOGETHER with its sibling test files in the same directory, not merely alone. Scope: a written checklist plus, if cheap, a gate hook.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
