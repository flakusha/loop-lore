<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: The license-header checker runs in no gate and the giwt subcommand reads the wrong REUSE dialect

**Status:** Not Started
**Priority:** Low
**Effort:** Medium
**Epic:** (none — hygiene/self-contained)

**Summary:**

Two halves of the same blind spot. The repo-side checker under scripts/ is correct; nothing invokes it, and the giwt subcommand that looks like it covers the job checks nothing.

1. Not wired into any gate. scripts/check-spdx.ts:54 sets BLOCKING = process.env.SPDX_CHECK === '1' and exits 0 with a Non-blocking note otherwise. scripts/check/parallel/gate-table.mjs contains zero spdx entries, so no bun run check invocation ever reaches it. The debt is invisible to every gate.

2. giwt spdx-check is a false negative. It prints REUSE.toml has no [[annotations]] blocks - nothing to check while REUSE.toml carries 7. scripts/check-spdx.ts:5-11 documents why: giwt's parser expects paths/license/copyright keys, while this repo's REUSE.toml uses a path key plus an inline copyright tag. Report upstream; the repo-side checker is the one that matters.

The 33 code-side violations the step-5 review described are already fixed. Running the checker with the blocking env var now reports a single remaining row, in .plan/feature-matrix.md. Whether to fix that row, or whether the whole-tree .plan and docs bulk should be rewritten under the REUSE rule, is a licensing decision and is left to whoever owns the policy.

Source: .tmp/step-5/repository-review.md F1 and F2.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
