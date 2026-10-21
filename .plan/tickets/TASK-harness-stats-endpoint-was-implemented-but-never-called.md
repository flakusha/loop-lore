<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness stats endpoint was implemented but never called

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-terminal-ui

**Summary:**

`loadStats` in src/tui/harness/api.ts had zero production callers, so `GET /api/v1/harness/stats` was implemented, admin-gated, schema-validated and tested — and never fetched by anything. The F3 overlay showed an empty list with no explanation and no way to see whether the harness had ever recorded anything.

Fixed in 42abe9123 by wiring it into the overlay's empty-runs branch: when the runs list comes back empty, the view fetches the stats rollup and renders it into the detail label, so an operator sees aggregate runs/failures/cost instead of a blank pane. A 403 (non-admin) degrades quietly — the detail label is simply left empty rather than showing an error the operator cannot act on.

Acceptance Criteria:

- [ ] An empty runs list shows the stats rollup rather than a blank detail pane
- [ ] A 403 from the stats endpoint degrades quietly (no error surfaced to a non-admin)
- [ ] `loadStats` has at least one production caller

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
