<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: close remaining release gate debt

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-code-quality.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Release checks remain red from a small set of known gate failures, and several scoped fixes already exist uncommitted on dev. Landing them is the prerequisite for a trustworthy 1.0.0 finalize.

**Evidence (dev 2026-11-18):** FIXED-release-code-updates-2026-11-18.md:35 and report 08; 10 unbaselined coverage-gap exports; 31 docs mermaid hydration failures; uncommitted knip ignore, shutdown split and regenerated priority matrix.

**Scope:** land the scoped fixes; accept or close the named coverage gaps; move mermaid renderer bootstrap into router.isReady().then so generated code blocks hydrate; verify the residual smoke.browser.ts gate.

**Acceptance Criteria:**

- [ ] bun run check gate set is green or failures are explicitly advisory with owner decision recorded
- [ ] mermaid docs render
- [ ] no new debt added to coverage baseline without acceptance

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
