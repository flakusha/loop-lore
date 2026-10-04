<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: ActivityPub actor signing keys and rotation undefined; no crypto-epic link

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation persists ownership or signature metadata but defines no keypair storage, rotation, or keyId lifecycle. Cross-check: epic-crypto.md and epic-encryption-workflow.md exist but neither references federation or swarm; the federation epic references EncryptionProvider generically but not those epic names. Also src/crypto/e2e/dh-ratchet.ts is orphaned (no production importer). Fix: add actor_keys (actor_id, key_id, public_jwk, private_jwk encrypted at rest, rotated_at) plus rotation AC; reference epic-crypto.md from the federation epic and reuse its key-at-rest standard; this also gives the orphaned e2e crypto module a federation consumer.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Verification 2026-09-29 — closed

All three claims in Summary verified against the code, not inferred from the commit log.

**Keypair storage.** The `activitypub_actor_keys` table exists
(`src/db/schema-core.ts:296` opens the `activitypub_actor_keys` block;
`src/db/migrations/001_init.ts:792` creates it), so the storage gap is closed.

**Generation and rotation.** `src/crypto/activitypub-keys.ts:43`
`generateActivityPubKey(database, actorId)` and `:162`
`rotateActivityPubKey(database, actorId)` both exist. Note that `rotateActivityPubKey`
is currently a thin delegate that calls `generateActivityPubKey` (`:166`) —
rotation is "mint a fresh key and replace", not a re-encrypt of existing private
material. That is a real behaviour, and it is covered rather than stubbed.

**Epic cross-link.** `epic-federation-swarm-sync.md:101` now names `epic-crypto.md`
with exactly the scope this ticket asked for: "EncryptionProvider seam; ActivityPub
actor signing keys + rotation, HTTP-signature verification, encrypted at-rest
storage of private signing material". The orphan-link problem is resolved.

**Tests.** `bun test src/crypto/actor-keys.test.ts` = **15 pass / 0 fail**, with 5
rotation cases. The encryption standard is reused through the existing
EncryptionProvider seam rather than a bespoke store, per the epic-crypto standard
the ticket asked to reuse.
