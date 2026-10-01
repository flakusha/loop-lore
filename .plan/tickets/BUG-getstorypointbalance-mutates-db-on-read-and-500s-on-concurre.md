<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: getStoryPointBalance mutates DB on read and 500s on concurrent first read

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-agency-story-points.md
**Tags:** agency-story-points

**Summary:** getstorypointbalance mutates db on read and 500s on concurre
**Context:** Context: src/services/agency/story-points/queries.ts:30-52; hit via GET /api/agency/balance (routes/agency/balance.ts:28).
**Acceptance Criteria:** synthesize a zero snapshot without writing, or INSERT ... ON CONFLICT DO NOTHING before re-read.

## Summary

Context: src/services/agency/story-points/queries.ts:30-52; hit via GET /api/agency/balance (routes/agency/balance.ts:28). Severity: blocking. A read endpoint INSERTs a zero row on miss — side-effecting GET; two concurrent first reads race the manual INSERT → UNIQUE violation → 500. Repro: parallel GET balance for a fresh (actor, world). Fix: synthesize a zero snapshot without writing, or INSERT ... ON CONFLICT DO NOTHING before re-read.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
