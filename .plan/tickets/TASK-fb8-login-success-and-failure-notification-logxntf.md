<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: FB8 login success and failure notification (LOGxNTF)

**Status:** Not Started
**Priority:** low
**Effort:** Small

**Summary:**

**Status:** Not Started
**Priority:** low
**Effort:** S (login notify calls plus locale strings and tests)
**Summary:** Successful login emits a welcome-back or new-session notice and repeated failures emit a security alert, via the notifications trigger layer.
**Context:** Source row matrix-frontend-backend-integration.md FB8 (LOG x NTF). Filed from 02-extract-features.md candidate 4, R02 candidate 4 confirmed (handleLogin login.ts:39-117 and handleDemoLogin :128-167 have zero notify calls). Files: src/routes/auth/login.ts and src/notifications/service/triggers.ts. New strings need keys in all 10 locale files plus login.test.ts additions. Dedup: grepped index.json for login notif and welcome back; zero hits.
**Acceptance Criteria:**
- Successful login emits a session notice; repeated failures emit a security alert.
- Strings localized in all 10 locale files.
- Tests cover success notice and failure alert paths.
- bun run check green.
**Related:** 02-extract-features.md candidate 4, R02 candidate 4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
