<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: fix(auth): warn when sessionTimeoutHours and jwtExpiresIn diverge

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** auth-config-contracts

**Summary:**

Sources: stream-c #11. Where: src/routes/auth/session.ts:73 (row TTL) vs :85-92 (JWT TTL); src/config/sections/auth.ts:9,17 (both default 24h). Gap: row TTL and JWT TTL express the same duration in two settings with no coherence check; skew either way yields mystery 401s (JWT outlives row, or row outlives JWT) with nothing pointing at the skew. Acceptance: boot logs a warning when the two diverge beyond a threshold; config.auth.example.toml cross-references the knobs. Priority: low - defaults agree today; protects future config drift.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
