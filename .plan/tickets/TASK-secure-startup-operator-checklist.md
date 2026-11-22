<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Secure startup operator checklist

**Status:** Done
**Priority:** medium
**Effort:** Medium
**Epic:** epic-deployment-infrastructure
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

## Summary

A consolidated secure-startup checklist now exists at `docs/ops/secure-startup.md`, linked from `docs/README.md` and `docs/spec/build-deploy.md` (`fce466f47`). Deployment guidance had been scattered across `docs/ops/bare-metal/network.md:120-127`, `docs/spec/build-deploy.md:103-122`, `deploy/docker-compose.yml:35-46`, and `deploy/Caddyfile:4-43`, so an operator could miss a security-relevant knob.

**Context:**
Audit `.tmp/research/tls-startup-audit-2026-11-22.md` §3 (Operator actions) enumerates the required settings; `FEAT-feat-security-security-posture-self-audit-endpoint.md` is a runtime admin endpoint, not operator docs, and no docs checklist ticket was found. Two stale claims need correcting alongside the page: the TLS-modes ticket plain-HTTP fallback premise was corrected in this reconciliation lane (previously tracked in `.tmp/research/tls-startup-gap-ticket-map-2026-11-22.md`), and the release tracker still says MFA docs are absent although `TASK-mfa-dedicated-operator-documentation.md` is Done.

## Scope

- One docs page with a pre-flight checklist covering: proxy termination vs direct TLS, JWT secret length, registration/demo defaults, cookie Secure override, trustProxy and publicOrigin, HSTS at edge or app, generated key permissions, setup-state TLS check caveat, integration token expiry, plaintext listener exposure, and firewall ports.
- Each item cites the config key or source doc; link from the existing deployment docs.
- Docs only; no runtime behavior changes. Correct the stale TLS fallback claim in the linked ticket via its owner, not in this ticket.

## Acceptance Criteria

- [x] Checklist page exists and is linked from deployment docs.
- [x] Every item names its config key or doc source; no stale HTTP fallback claim.
- [x] `bun run md:lint` passes on the new page.
- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification

- `bun run md:lint`
- `bun run plan:validate`

**Acceptance Criteria:**

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

**Resolved:** 2026-11-22 registry-driven close: git issue 375ae56 (registry tip: 1f0a2fa9f Konstantin Fedotov Auto-closed: appended .md marker marks TASK-SECURE-STARTUP-OPERATOR-CHE)
