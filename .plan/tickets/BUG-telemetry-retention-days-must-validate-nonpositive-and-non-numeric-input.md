<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: Telemetry retention days must validate nonpositive and non-numeric input

**Status:** Done
**Priority:** High
**Effort:** Small
**Epic:** epic-telemetry
**Caveats:** security, partial failure, stale state, observability

**Context:**

Unset retention has a default, but negative, zero, or non-numeric input must not become policy.

**Summary:**

`TELEMETRY_RETENTION_DAYS` parsing accepts values that should never become a retention policy. Invalid input must be rejected or normalized at the configuration boundary.

**Evidence:**

- `src/telemetry/config.ts:47`

**Scope:**

- Validate negative, zero, and non-numeric retention values.
- Keep the current default behavior for unset input.
- Align adjacent telemetry enablement checks only where they share the same boundary; do not redesign telemetry.

**Acceptance Criteria:**

- [ ] Negative retention input cannot become the active policy.
- [ ] Zero and non-numeric input have explicit, tested behavior.
- [ ] Regression tests cover unset, valid, negative, zero, and non-numeric input.

git issue: 2387a37

- [ ] Affected telemetry/config tests pass.

**Related:**

- `TASK-embedding-and-telemetry-retention-policies.md`
