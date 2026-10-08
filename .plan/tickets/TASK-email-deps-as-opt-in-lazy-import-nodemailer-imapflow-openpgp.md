<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Email deps as opt-in: lazy import nodemailer/imapflow/openpgp

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-email-integration

**Summary:**

Declare imapflow, nodemailer, openpgp as optional peer dependencies; EmailAdapter (src/integrations/email/, green-field) loads them via lazy dynamic import only when email is configured — never static top-level imports. send() with no email config fails gracefully with a typed not-configured error. Unblocks auth F5 email OTP SMTP slice (epic-auth-channel-provisioning.md). AC: cold start with no email configured imports zero email libs (assert via module-load probe); with libs installed SMTP send + IMAP fetch work against mock servers; setup docs in docs/integrations/email.md. Depends on: ticket 1 seams. Epic: epic-email-integration.md.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
