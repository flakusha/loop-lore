<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Key-material revoke-then-insert sequences are non-transactional: a failure strands the actor with zero active keys

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-crypto

**Summary:**

Two sites, one root cause: revoke UPDATE then bare INSERT with no transaction.

A. Actor keys (src/crypto/actor-keys.ts:218-232): updateTable(actor_keys).set(status: expired) at :220-228, then generateActorKey(...) at :231 as a separate round trip - no transaction() anywhere in the path (key-rotation/rotate.ts:51 even comments atomically: expire old + create new). runAutoRotation (auto-run.ts:59-71) catches per-actor and continues, so the actor ends with no active key and all subsequent encryption for it breaks. The correct in-repo pattern exists at src/crypto/activitypub-keys.ts:82-102.
Verification: CODE-READ - trace actor-keys.ts:220-228 -> :231 -> rotate.ts:51-52 -> auto-run.ts:59-71; executing the failure needs a live DB mid-rotation, but the absence of any transaction is fully determined by the read.

B. Server registry pubkeys (src/crypto/e2e/server-registry.ts:82-102): the revoke exists specifically so the unique index lets us insert (:82); the insert at :91-102 has no transaction, no onConflict handling and no unique-violation retry, so a concurrent registration or insert failure leaves the old key revoked and nothing active, breaking subsequent e2e sends to that actor. Precedent for the fix: src/crypto/chat-keys.ts:149-182 (insert-race retry).
Verification: CODE-READ - trace server-registry.ts:84-89 (revoke UPDATE with revoked_at-is-null guard) -> :91-102 (bare INSERT) -> :104-108 (re-read assumes the insert landed).

Impact: one failed insert after a revoke leaves the actor with zero active keys/pubkeys - silent, persistent crypto breakage.

Fix: wrap expire+insert (and revoke+insert) in database.transaction(); add one retry on unique violation for the registry path.

Source: .tmp/glm-review/deep-story-crypto-1015.md F-4 + F-6 (gitignored; recorded here verbatim). Related Done predecessor BUG-key-rotation-non-transactional-incomplete-re-encryption-stra (ab378a0) covered history orphaning, not the zero-active-keys window.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-25 registry-driven close: git issue 3210ca1 (registry tip: eea9c72d8 Konstantin Fedotov Close issue)
