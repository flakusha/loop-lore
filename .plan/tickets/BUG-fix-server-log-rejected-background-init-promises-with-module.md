<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): log rejected background-init promises with module + error

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** server-hardening

**Summary:**

Sources: stream-a #6. Where: src/server/init-background-services.ts:31-48, :71-97, :147-148 (await Promise.allSettled(initPromises) result discarded). Gap: inner init IIFEs have no try/catch and the allSettled results are ignored, so a throw (failed import, seeding crash, startLlamaCpp rejection) vanishes with no log. Startup looks healthy while providers/templates are missing; the failure surfaces later as no provider far from the cause. Acceptance: each rejected init promise produces a log line naming the module/job plus the error (inspect allSettled results or add per-job try/catch). A failed auto-start is identifiable in boot logs without reproducing the later no provider symptom. Priority: medium - silent degradation of AI providers at boot; debuggability, not data loss.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
