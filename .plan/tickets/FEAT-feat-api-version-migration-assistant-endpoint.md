<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# FEAT: feat(api): version-migration assistant endpoint

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Derived-feature proposal F06 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-api-versioning.md` (In Progress) + `epic-api-openapi.md` (Not Started) + T02 (deprecation headers on legacy surface) + T06 (fallback-path coverage) + T22 (4xx + supported-versions signal for unknown versions).

Derivation: After T02/T06 every legacy response carries `Sunset`/`Deprecation`/`Link`, and after T22 every unknown-version request gets a machine-readable supported-version list. The server therefore already announces everything a migration assistant needs; the endpoint just aggregates it: which clients still hit legacy paths (via the T05-unified request metrics) and what to change.

Draft epic sketch / acceptance:

- `GET /api/v1/version-status` returns supported/unsupported versions, sunset timeline, and per-route legacy-hit counts.
- Legacy-hit counting reuses the governance metrics collector (normalized route + version dimension).
- Unknown-version 4xx bodies link to this endpoint (closes the T22 redirect-to-404 confusion).
- Deprecation-header values and this endpoint's timeline derive from one config source (no skew).
- OpenAPI spec marks deprecated paths so generators emit migration warnings (feeds F04's catalog).

Priority: med — zero value until T02/T22 land, then nearly free; unblocks the eventual v2 without a flag day.

Blocked-by: T02/T06/T22.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). Medium-priority composition group F06-F09.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
