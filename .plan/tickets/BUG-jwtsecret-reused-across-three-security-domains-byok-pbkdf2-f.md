# BUG: jwtSecret reused across three security domains; BYOK PBKDF2 fixed global salt

**Status:** 🔄 In Progress (PII leg done; JWT / signed-URL / BYOK legs open)
**Priority:** high
**Effort:** Medium

## Summary

src/auth/jwt.ts + src/assets/controller/signed-url.ts:186 + src/nsfw/telemetry-id-hashes.ts (`actorHash`/`chatHash`, formerly `pii-redact.ts:82`) — one secret serves JWT MAC, signed-URL HMAC, and PII hash salt → domain confusion, single compromise crosses auth and pseudonymization. Fix: HKDF domain-separated subkeys or dedicated secrets. src/crypto/byok.ts:29 — PBKDF2 with fixed global salt 'loop-lore-byok-v1', no per-record salt → identical keys across deployments/users for same passphrase, precomputation possible. Fix: per-record random salt stored alongside ciphertext. Related minor signed-url.ts:186: assets.signedUrlSecret defaults '' silently inheriting jwtSecret — warn at config load.

## Progress

- PII leg done: `actorHash`/`chatHash` hash under separate HKDF domains (`NSFW_PII_ACTOR` / `NSFW_PII_CHAT`) via the shared `hashWithDomain` helper; module renamed `pii-redact.ts` → `telemetry-id-hashes.ts`; cross-type isolation plus helper coverage tests green.
- Open: JWT MAC domain, signed-URL HMAC domain + empty-secret default warn, BYOK per-record salt.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
