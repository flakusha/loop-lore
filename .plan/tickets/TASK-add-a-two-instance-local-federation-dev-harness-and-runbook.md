<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add a two-instance local federation dev harness and runbook

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:** Provide a two-instance local federation harness (script or compose) plus a runbook, so two loop-lore servers can be brought up side by side from a clean checkout.

**Context:**

There is no way to do this today. `deploy/docker-compose.yml` is production-only — it requires `DOMAIN` and `ACME_EMAIL` via hard `${VAR:?}` guards (`:20-21`), fronts the app with Caddy, and assumes ACME-reachable ports 80/443. `deploy/Caddyfile.local` proxies a single origin. Neither can stand up a second instance.

The blockers are enumerated in `docs/review/federation-local-multi-instance-review.md` §3, and this ticket is the operational answer to them rather than a code change. Until it lands, every other ticket in this epic is only verifiable in unit tests — which is precisely how the entire sender path stayed dead while the suite stayed green.

**Direction:**

1. Add a local dev compose file or shell script under `deploy/` (keep production files untouched) that starts two services from the same build.
2. **Distinct hostnames** — `a.localhost` and `b.localhost`. Distinct ports alone do not isolate sessions; see `TASK-isolate-auth-cookies-per-local-instance-so-two-dev-servers-d.md` for why (RFC 6265 §5.1.4/§5.2.3).
3. Per instance: distinct `DATA_DIR` (hence a distinct SQLite DB), distinct `SERVER_PUBLIC_ORIGIN` (`src/config/sections/server.ts:27` — unset means peers negotiate against the wrong origin), the other listed in `federation.peers`, and one shared `MESH_PSK` across both.
4. Runbook must name every required per-instance env var, and must call out the migration-ordering caveat: migrations run on every boot with no leader election (`docs/spec/multi-instance-reconciliation.md`), so **both instances must complete migrations before either serves traffic**.
5. Add a smoke check that each instance answers on its own origin and that `GET /api/instance-state` reports the correct `publicOrigin`.

**Acceptance Criteria:**

- [ ] One documented command brings up two instances on distinct hostnames from a clean checkout
- [ ] The runbook names every required per-instance env var, including `DATA_DIR`, `SERVER_PUBLIC_ORIGIN`, `MESH_PSK`, and the peer list
- [ ] The runbook states plainly that ports alone do not isolate cookies, with the RFC citation
- [ ] The runbook states that migrations must complete on both instances before either serves traffic
- [ ] `GET /api/instance-state` on each instance reports that instance's own `SERVER_PUBLIC_ORIGIN`
- [ ] Both instances share one `MESH_PSK` and list each other as a peer
- [ ] The harness does not require `DOMAIN`, `ACME_EMAIL`, or internet access

**Dependencies:**

- `TASK-allow-data-dir-to-be-overridden-by-env-var.md` — per-instance state roots
- `TASK-bootstrap-mesh-peers-from-config-federation-peers-at-boot.md` — makes the configured peer list actually take effect
- `TASK-add-federation-to-the-config-domains-list-so-config-federati.md` — lets the peer list come from a domain config file
- `TASK-isolate-auth-cookies-per-local-instance-so-two-dev-servers-d.md` — the hostname requirement this runbook documents

**Out of Scope:**

- Production multi-instance deployment topology (`epic-deployment-topologies.md`)
- Migration leader election (`epic-multi-instance-reconciliation.md`) — this ticket documents the safe ordering instead
- TLS between the two local instances
