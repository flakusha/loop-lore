<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Asset/emotion-job hygiene: orphaned thumbnails, stuck running job rows

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Two MINOR lifecycle defects, one batch: (1) asset delete leaves generated thumbnails orphaned (src/assets/service/delete.ts:57) - purge derived thumbnails with the asset in the same transaction. (2) emotion-avatar job rows can be stuck in "running" after a crash/restart - no recovery sweep marks them failed (src/characters/services/emotion-avatar-service/job-records.ts:152, index.ts:129) - add startup or sweep-time reconciliation that fails stale running rows.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
