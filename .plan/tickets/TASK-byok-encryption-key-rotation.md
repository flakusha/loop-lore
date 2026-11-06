<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: byok-encryption-key-rotation

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-byok-api-keys

**Summary:**

Ship the one-shot re-encryption migration onto `v2:` envelopes plus key-generation tooling, closing `BUG-single-global-byok-encryption-key-no-rotation-story`. Research findings (2026-11-05 credential pass): `packages/core/src/crypto/byok.ts` (re-exported by `src/crypto/byok.ts`) already writes a versioned envelope `v2:salt:iv:ciphertext` (BYOK_KEY_VERSION = 2, AES-256-GCM, per-record salt, HKDF-SHA256 from `config.byoKey.encryptionKey`) and refuses unknown version tags loudly, "so key rotation can carry a per-record generation tag; the one-shot re-encryption migration is not [built]". `key_version` columns exist on both `user_api_keys` and `mesh_peers` (migration `080_byok_key_version.ts`, default 1 = bare format). Threat model being mitigated: DB + `byoKey.encryptionKey` recovers every user's key (epic-byok-api-keys ":132-141"); one global key for all users, shared with peer-token sealing (see federation-peer-token-key-domain).

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] Migration re-encrypts all `user_api_keys` (and `mesh_peers` tokens) to `v2:` envelopes with a new generation tag
- [ ] Key-generation/rotation tooling documented (how to generate and swap `byoKey.encryptionKey`)
- [ ] Old-format records decrypt correctly during the transition window; unknown version tags still refuse loudly
- [ ] `BUG-single-global-byok-encryption-key-no-rotation-story` closes

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
