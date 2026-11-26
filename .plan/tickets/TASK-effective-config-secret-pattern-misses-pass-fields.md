<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Effective config secret pattern misses Pass fields

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-security-sandboxing
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

SECRET_KEY_PATTERN in src/admin/config-keys.ts matches password but not imapPass/smtpPass, so the effective-config export can leak abbreviated values. Use a precise pattern (pass\b or explicit imap.?pass|smtp.?pass) and add a regression test; avoid bare pass, which false-positives idempotency.bypassHeader.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
