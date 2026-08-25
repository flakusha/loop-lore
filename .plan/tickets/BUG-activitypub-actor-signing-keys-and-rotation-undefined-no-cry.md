# BUG: ActivityPub actor signing keys and rotation undefined; no crypto-epic link

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation persists ownership or signature metadata but defines no keypair storage, rotation, or keyId lifecycle. Cross-check: epic-crypto.md and epic-encryption-workflow.md exist but neither references federation or swarm; the federation epic references EncryptionProvider generically but not those epic names. Also src/crypto/e2e/dh-ratchet.ts is orphaned (no production importer). Fix: add actor_keys (actor_id, key_id, public_jwk, private_jwk encrypted at rest, rotated_at) plus rotation AC; reference epic-crypto.md from the federation epic and reuse its key-at-rest standard; this also gives the orphaned e2e crypto module a federation consumer.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
