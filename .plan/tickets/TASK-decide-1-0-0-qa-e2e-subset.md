<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide 1.0.0 QA e2e subset

**Status:** Not Started
**Priority:** high
**Effort:** Small

**Summary:**

Name the exact e2e/browser subset that gates release 1.0.0, including how SMK-blocked skips are represented.

**Context:** The release tracker names this decision but no ticket owns it. Individual skip and gate-wiring tickets exist; none decides the release QA subset.

**Acceptance Criteria:**

- [ ] Decision recorded in the 1.0.0 tracker: included specs, advisory specs, and blocked skips.
- [ ] Gate wiring ticket updated to reference the decision.
- [ ] Tracker open-question entry resolved.

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: gate report shows the selected subset.
