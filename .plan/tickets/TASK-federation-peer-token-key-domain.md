<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: federation-peer-token-key-domain

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-federation-offload-quotas

**Summary:**

Move peer shared-token sealing off `byoKey.encryptionKey` onto its own key domain, reusing the v2 envelope + `key_version` machinery. Research findings (2026-11-05 credential pass): peer tokens are sealed at save time with `encryptValue` under the SAME server secret the BYOK store uses — `src/federation/peer-workload-token.ts:4-8` (`config.byoKey.encryptionKey`), one secret for two security domains. This re-runs the exact pattern of `BUG-jwtsecret-reused-across-three-security-domains` one level down: one leaked secret opens users' provider keys AND the federation admission credentials. `packages/core/src/crypto/byok.ts` already has the versioned `v2:salt:iv:ciphertext` envelope (BYOK_KEY_VERSION = 2) and `key_version` columns exist on `mesh_peers` (migration `080_byok_key_version.ts`), making per-domain keys straightforward. The epic's constraint "No second encryption facility, no plaintext token column" (`epic-federation-offload-quotas.md:180-182,491-501`) is preserved — this is a second key, not a second facility.

**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Acceptance Criteria:**

- [ ] Peer tokens sealed under a dedicated key domain (new config key), not `byoKey.encryptionKey`
- [ ] v2 envelope + `key_version` reused; no plaintext token column; migration path for existing sealed tokens
- [ ] Old and new domains documented; decrypt failures stay fail-closed and loud

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
