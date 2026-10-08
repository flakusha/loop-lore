<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add a two-instance local federation dev harness and runbook

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

There is no way to run two loop-lore instances locally: deploy/docker-compose.yml is prod-only (requires DOMAIN and ACME_EMAIL) and deploy/Caddyfile.local proxies a single origin. Add a local dev harness - a compose file or script plus a runbook - that boots two instances with distinct hostnames (a.localhost / b.localhost), distinct DATA_DIR values and thus distinct SQLite DBs, distinct SERVER_PUBLIC_ORIGIN (src/config/sections/server.ts:27) so self-advertised origins are correct, and one shared MESH_PSK (src/config/schema-class/federation.ts:11). The runbook must also call out two traps: cookies are not port-scoped so distinct ports alone do not isolate sessions, and migrations run on every boot with no leader election (docs/spec/multi-instance-reconciliation.md), so both instances must migrate before either serves. Acceptance: a clean checkout can bring up two federating instances with one documented command; the runbook names every required per-instance env var; a smoke check confirms each instance answers on its own origin.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
