<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Overlapping federation outbox drain passes re-push the same rows

**Status:** Not Started
**Priority:** low
**Effort:** Medium

**Summary:**

Evidence (approved finding 9, P3; .tmp/concern-dev-2026-10-07.md, .tmp/concern-federation.md): src/federation/outbox.ts:146-153 (added in 3d5489eaf) — the drain selects due rows without claiming them (no status flip before work) and runs up to 25 rows x 2 POSTs x 5s timeout (>=250s worst case) on a */2 cron whose callback src/cron/registry.ts:127-131 is void invoke(...) with no in-flight guard, so a second pass selects the same due rows and re-reserves/re-pushes them concurrently; transient double capacity is held receiver-side until the TTL sweep. Executed evidence (.tmp/review/repro-overlap.ts): two concurrent passes over one due row -> 2 reserve + 2 deliver POSTs, both report delivered:1. Severity: wasted work only — receiver LWW dedup makes redelivery idempotent, no data loss. Fix: skip the tick when the previous run of the same job is still awaited, or flip due rows to an in-flight status before pushing.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
