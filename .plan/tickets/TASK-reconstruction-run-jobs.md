<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Reconstruction run jobs

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-3d-generation
**Tags:** 3d, db, routes
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

reconstruction_runs table (job-records pattern) with pipeline discriminator, input/params JSON, status state machine (queued/running/judging/complete/failed/canceled), judge_verdicts, plus owner-scoped routes (POST run, poll), flow-control/cancellation integration, and a rate-limit policy entry. AC: restart mid-run resumes to a terminal state (never regress terminal); cancel leaves no orphaned ComfyUI jobs (interrupt called); non-owner 403s.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
