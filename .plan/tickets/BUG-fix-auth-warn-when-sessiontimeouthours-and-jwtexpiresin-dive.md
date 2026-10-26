<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(auth): warn when sessionTimeoutHours and jwtExpiresIn diverge

**Status:** In Progress
**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue 094b3b5): Verified: src/config/sections/auth.ts:10,18 keep divergent defaults (sessionTimeoutHours 24 = 86,400s, jwtExpiresIn 86,400) with no coherence warning anywhere in src/config or boot; grep shows only defaults, schema metadata and independent consumers (session.ts:74, sessions-switch).
**Priority:** low
**Effort:** Medium
**Epic:** epic-auth-config-contracts

**Summary:**

Sources: stream-c #11. Where: src/routes/auth/session.ts:73 (row TTL) vs :85-92 (JWT TTL); src/config/sections/auth.ts:9,17 (both default 24h). Gap: row TTL and JWT TTL express the same duration in two settings with no coherence check; skew either way yields mystery 401s (JWT outlives row, or row outlives JWT) with nothing pointing at the skew. Acceptance: boot logs a warning when the two diverge beyond a threshold; config.auth.example.toml cross-references the knobs. Priority: low - defaults agree today; protects future config drift.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 094b3b5 (registry tip: 1bb2f256b Konstantin Fedotov Close issue)
