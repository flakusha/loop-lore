<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide 1.0.0 QA e2e subset

**Status:** Done
**Priority:** high
**Effort:** Small

**Summary:**

Name the exact e2e/browser subset that gates release 1.0.0, including how SMK-blocked skips are represented.

**Context:** Operator ruling 2026-11-19: the QA subset is required, not advisory. `tests/e2e/flows/browser/qa-subset.txt` names the included specs; credential/availability-gated live tiers remain advisory, and SMK/chatState skips are documented as blocked in that file.

**Acceptance Criteria:**

- [x] Decision recorded in the 1.0.0 tracker: included specs, advisory specs, and blocked skips.
- [x] Gate wiring references the decision: `scripts/check/parallel/gate-table.mjs` flips `e2e - browser (qa subset)` from advisory to blocking.
- [x] Tracker open-question entry resolved.

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: gate report shows the selected subset.
