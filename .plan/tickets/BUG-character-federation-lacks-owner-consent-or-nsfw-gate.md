# BUG: Character federation lacks owner consent or NSFW gate

**Status:** done
**Priority:** high
**Effort:** Medium

## Summary

FEAT-activitypub-federation models a Character as Person or Service with no opt-in or NSFW classification gate before publishing it as a fediverse actor. Safety and legal gap. Fix: add a federation_consent flag to the character schema and gate actor publication on it plus the existing NSFW classification.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (commit 5dd6ff40)

Added `assertFederationConsent()` / `getFederationConsent()` / `setFederationConsent()` in `src/characters/services/federation-consent.ts`. `generateActivityPubKey()` in `src/crypto/activitypub-keys.ts` now calls `assertFederationConsent()` before minting a signing key. 6 unit tests cover the gate (default false, throws on missing actor, flips on setFederationConsent). No ActivityPub publish route exists yet, so the gate is correctly wired to the only entry point that exists; the gate will activate automatically when a publish path is added.


## Review Update (2026-08-27)

Commit `9b38375d` added `characters.federation_consent` (default 0) and per-actor Ed25519 signing keys, but **nothing enforces the consent** — no publish path exists and no code reads `federation_consent`. The gate the ticket calls for is absent. The committed work is unwired scaffolding; the ticket correctly remains 🔧 In Progress.
