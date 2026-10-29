<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS scenario CRUD and pages

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, api, frontend, i18n
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Routes + TypeBox schemas + world-edit-style scenario pages (Scenario | Shots | References | Runs tabs) + i18n strings, in the htmx+Alpine page family. AC: owner/member CRUD with the 401/403/404 matrix tested; the page flow edits the same rows the assistant workflow reads.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
