<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: remote-harness-tls-token-auth

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-remote-harness-federation.md
**Tags:** harness, remote
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TLS plus bearer-token auth for off-machine harness connections, plus bind-address config defaulting to loopback. Builds on the loopback listener landing separately: add TLS termination for remote binds, per-connection token auth reusing the design-B token-file pattern, and config harness.remote bind plus tls plus tokenFile that refuses non-loopback binds without TLS and token.

Explicitly NOT building:

- The loopback listener itself (separate lane).
- mTLS or client certificates in v1 (bearer token only).
- Multi-user ACLs (remote is owner-only; collaboration is the pijul ticket).
- WAN auto-discovery or NAT traversal.
- A second auth system (reuse the token-file pattern).

**Context:**

Design-B proxy from .tmp/research/harness-stdio-while-running.md: thin stdio shim forwards to a local-only listener. That listener is loopback-only today; this ticket is the REMOTE side that lets off-machine clients reach it safely. Related: epic-harness-integration.md, epic-external-harness-acp.md.

**Acceptance Criteria:**

- [ ] Bind address config exists and defaults to loopback.
- [ ] Non-loopback bind without TLS plus token refuses to start with a clear error.
- [ ] Bad or missing token is rejected and every attempt is audited.
- [ ] Token file permissions enforced (owner-only read).
- [ ] Tests passing, documentation updated.
