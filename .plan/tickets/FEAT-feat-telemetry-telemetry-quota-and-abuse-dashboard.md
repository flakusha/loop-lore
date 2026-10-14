<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: feat(telemetry): telemetry quota and abuse dashboard

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Derived-feature proposal F08 (composes verified app-review fixes T01-T28). Source: `.tmp/derived-features/proposals.md`. No greenfield invention: composes 2+ existing epics/tickets whose fix work is the prerequisite.

Composes: `epic-api-telemetry.md` (Not Started) + `epic-analytics-observability.md` (Not Started) + `epic-guest-access.md` (Not Started; unauthenticated beacons must keep working) + T28 (auth/limit on anonymous event writes) + existing admin analytics routes in `src/routes/telemetry.ts`.

Derivation: `telemetry.ts` already pairs open ingestion with admin-gated analytics over `telemetry_events`; T28 adds the missing bound (auth-when-required or per-IP limiter + row caps). Quota visibility (per-source volume, top event types, dropped-capped counts) is the operator side of that bound, and guest-access needs exactly this: safe anonymous beacons with observable abuse controls.

Draft epic sketch / acceptance:

- Admin analytics gains per-source/per-IP volume views and cap-drop counters from the T28 limiter.
- Solo-mode pre-auth beacons keep working; multi-user anonymous floods hit the documented bound with a 429 envelope (T05 shape).
- Retention/cap policy (max rows, TTL) is config-surfaced alongside the existing `idempotency`/`observability` sections (T19's example coverage).
- Agency-quality telemetry (`epic-research-agency-quality.md`) consumes the same quota posture for its event stream.
- A test floods the ingest endpoint anonymously and asserts bounded table growth + dashboard counter movement.

Priority: med — required before guest/public surfaces ship; otherwise telemetry is an unbounded-write vector.

Blocked-by: T28.

Grouping: filed as FEAT (giwt ticket supports `--epic` linking but not epic creation; no new epics cut). Medium-priority composition group F06-F09.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
