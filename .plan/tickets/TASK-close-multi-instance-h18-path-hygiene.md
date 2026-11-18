<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Close multi-instance H18 path hygiene

**Status:** Not Started
**Priority:** medium
**Effort:** Small

**Summary:**

Close the H18 leg of multi-instance path hygiene, which the F18/H4/H5 closeout ticket does not cover.

**Context:** TASK-instance-path-hygiene-close-f18-h4-h5 names F18, H4 and H5 only. Repo-wide search finds no H18 ticket or plan reference.

**Acceptance Criteria:**

- [ ] H18 requirement restated from the original hygiene audit.
- [ ] Implementation or explicit Wontfix ruling with rationale.
- [ ] Test or documented verification for the resulting path behavior.

**Caveats:** TOCTOU: instance paths resolve at boot. Security: paths must remain instance-scoped. Authorization: operator controls instance config. Parallelism: isolated config test. Partial failure: retain current path behavior and report. Rollback: revert the change. Observability: boot log records resolved paths.
