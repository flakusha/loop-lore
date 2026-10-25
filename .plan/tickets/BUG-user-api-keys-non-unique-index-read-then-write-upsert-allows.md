<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: user_api_keys non-unique index + read-then-write upsert allows dup rows

**Status:** Done
**Status Note:** resolved 2026-10-25 (`fix/bug-sweep`) — two halves, both landed — (1) DB enforcement: migration 078_user_api_keys_unique adds UNIQUE uq_user_api_keys_user_provider on (user_id, provider_name) (defensive dedupe first: duplicate groups collapse to the NEWEST row — the last save is the one the user meant — with a process warning), drops the now-redundant plain composite index, down() restores the old shape; (2) route upsert: POST /api/user-api-keys (src/routes/api-keys.ts:100-121) replaced its read-then-write with an atomic `onConflict(user_id, provider_name).doUpdateSet(...)` — a raced pair is now one insert + one update instead of dup rows (pre-078) or a constraint crash (post-078 pre-fix). Tests: src/db/078_user_api_keys_unique.test.ts (3: collapse-newest+warn+enforce+reject, cross-user/cross-provider unconstrained, down restores) mirroring 045's harness; src/routes/api-keys.coverage.test.ts racing double-store (interleave-dependent pre-fix — the deterministic DB-level before-evidence is the migration test's dropUniqueIndex path where same-(user,provider) rows coexist) → both 200 + exactly 1 row. Suites: 078 test 3/3, api-keys coverage 7/7, providers 6/6, user-api-key 7/7. Gates green (run 868938-mvnhkszri typecheck+eslint; db:sync-manifest regenerated, no output change — index-only). Worktree fix/bug-sweep, issue BUG-USER-API-KEYS-NON-UNIQUE-INDEX-READ-THEN-WRITE-UPSERT-ALLOWS.
**Priority:** high
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

No UNIQUE(user_id,provider_name) — plain composite index (001_init.ts:362-366). Concurrent POSTs insert duplicate rows; executeTakeFirst reads arbitrary one. Fix: add unique constraint + onConflict upsert.

**Context:**

Closure rationale (2026-10-25, branch `fix/bug-sweep`): two halves, both landed — (1) DB enforcement: migration 078_user_api_keys_unique adds UNIQUE uq_user_api_keys_user_provider on (user_id, provider_name) (defensive dedupe first: duplicate groups collapse to the NEWEST row — the last save is the one the user meant — with a process warning), drops the now-redundant plain composite index, down() restores the old shape; (2) route upsert: POST /api/user-api-keys (src/routes/api-keys.ts:100-121) replaced its read-then-write with an atomic `onConflict(user_id, provider_name).doUpdateSet(...)` — a raced pair is now one insert + one update instead of dup rows (pre-078) or a constraint crash (post-078 pre-fix).

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue d16b146 (registry tip: 07fe097ee Konstantin Fedotov Close issue)
