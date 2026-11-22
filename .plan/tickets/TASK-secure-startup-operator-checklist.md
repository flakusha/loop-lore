<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Secure startup operator checklist

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-deployment-infrastructure
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

No consolidated secure-startup checklist exists. Deployment guidance is scattered across `docs/ops/bare-metal/network.md:120-127`, `docs/spec/build-deploy.md:103-122`, `deploy/docker-compose.yml:35-46`, and `deploy/Caddyfile:4-43`, so an operator can miss a security-relevant knob.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §3 (Operator actions) enumerates the required settings; `FEAT-feat-security-security-posture-self-audit-endpoint.md` is a runtime admin endpoint, not operator docs, and no docs checklist ticket was found. Two stale claims need correcting alongside the page: the TLS modes ticket still describes a plain-HTTP fallback (amendment tracked in `.tmp/research/tls-startup-gap-ticket-map-2026-11-22.md`), and the release tracker still says MFA docs are absent although `TASK-mfa-dedicated-operator-documentation.md` is Done.

## Scope

- One docs page with a pre-flight checklist covering: proxy termination vs direct TLS, JWT secret length, registration/demo defaults, cookie Secure override, trustProxy and publicOrigin, HSTS at edge or app, generated key permissions, setup-state TLS check caveat, integration token expiry, plaintext listener exposure, and firewall ports.
- Each item cites the config key or source doc; link from the existing deployment docs.
- Docs only; no runtime behavior changes. Correct the stale TLS fallback claim in the linked ticket via its owner, not in this ticket.

## Acceptance Criteria

- [ ] Checklist page exists and is linked from deployment docs.
- [ ] Every item names its config key or doc source; no stale HTTP fallback claim.
- [ ] `bun run md:lint` passes on the new page.
- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Verification

- `bun run md:lint`
- `bun run plan:validate`

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
