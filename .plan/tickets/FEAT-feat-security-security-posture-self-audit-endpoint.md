<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: feat(security): security-posture self-audit endpoint

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

Derived-feature proposal F01 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-certificate-and-tls-management.md` (In Progress) + Authorization & Access Control epic (In Progress) + T10 (TLS fail-closed) + T20 (AUTH_JWT_SECRET wiring) + T24 (non-loopback solo-bind gate).

Derivation: T10/T20/T24 are three instances of one missing capability: the server never reports whether its own security posture matches operator intent (TLS requested-but-plaintext, documented secret ignored, LAN bind with solo super-user). Once each fails closed at boot, the checks already exist — exposing them as one auditable report is composition, not invention.

Draft epic sketch / acceptance:

- `GET /api/v1/admin/security-posture` (admin-gated) returns per-check pass/warn/fail for TLS mode, secret resolution, bind-vs-auth-required coherence.
- Each finding cites the config key and the doc string that names it (reuses T20's authMeta registry).
- Boot log emits the same report at warn level when any check fails-open by explicit opt-in.
- A test pins every documented secret spelling resolving through the check (extends T20's ENV_MAP coverage).
- Frontend admin panel surfaces the report as a checklist (extends `epic-frontend-admin.md`, Done).

Priority: high — converts three silent-misconfig vectors into one operator-visible gate.

Blocked-by: T10/T20/T24.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). High-priority composition group F01-F05.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
