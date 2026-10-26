<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Single global BYOK encryption key, no rotation story

**Status:** Done
**Status Note:** [2026-10-26 sweep-C verify + fix pass] Minimal ticket-directed step landed: migration `080_byok_key_version.ts` adds `key_version` (integer, NOT NULL, default 1 = bare format) to `user_api_keys` and `mesh_peers` (the two tables carrying BYOK-encrypted values); `src/crypto/byok.ts` adds `encryptVersioned` (emits `v2:salt:iv:ciphertext`, `BYOK_KEY_VERSION = 2`) and `decryptValue` now reads ALL THREE formats (versioned, bare 3-chunk, legacy 2-chunk), failing loudly on unknown versions. Existing rows need no rewrite — reads accept old and new. One-shot re-encrypt under per-generation keys remains future work (this ticket's full scope); writers still emit the bare format until that lands. Regenerated: db:sync-types, db:sync-manifest, schemas:check. Verified: bun test src/crypto/byok.test.ts src/db/migrations.test.ts src/db/migration-roundtrip.test.ts (282 pass).
**Priority:** medium
**Effort:** Medium
**Epic:** epic-byok-api-keys
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

All users share one secret; rotation = mass re-encryption, no versioning; legacy rows never auto-migrated (byok.ts:22-23). Fix: key-version column + one-shot re-encrypt migration.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 4a052a5 (registry tip: ede7b5506 Konstantin Fedotov Close issue)
