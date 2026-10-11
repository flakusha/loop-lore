<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(server): fail closed when configured TLS certs cannot be provisioned

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** server-hardening

**Summary:**

Sources: stream-a #9. Where: src/server/start.ts:131-146 (else warn HTTPS unavailable - serving HTTP only). Gap: when config.server.tls is set but ensureTlsCerts returns falsy, the server only warns and continues HTTP-only. An operator who explicitly requested TLS gets plaintext without a fail-closed signal. Acceptance: configured-TLS + provisioning failure throws/exits non-zero; warn-and-continue remains only when TLS was never configured. A start test covers the falsy-cert path. Priority: high - silent plaintext downgrade against explicit operator intent.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
