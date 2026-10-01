<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Scoped coverage gate omits the E2E_SAFEGUARD prefix its plain-mode sibling sets

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

`scripts/check-parallel.mjs:486` prefixes `E2E_SAFEGUARD=1` onto the plain-mode coverage gate, but the SCOPED coverage gate at `:500` has no such prefix. `giwt finalize` invokes the runner with `--diff-base`, which takes the SCOPED branch — so every finalize runs its coverage gate with the rate limiter and telemetry LIVE, unlike plain mode.

Currently harmless: `scopedCoveragePaths()` (`:235-247`) maps only to `src/<mod>` directories filtered by `dirHasTests`, so `tests/e2e/` never appears in a scoped path list. It is nonetheless a real latent asymmetry, and any future change widening scoped coverage to e2e-adjacent code would flip rate limiting on mid-finalize with no warning.

Fix direction: make `:500` match `:486`, or better, single-source the gate environment so the two cannot drift again.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
