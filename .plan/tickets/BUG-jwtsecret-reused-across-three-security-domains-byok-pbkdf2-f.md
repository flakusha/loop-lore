# BUG: jwtSecret reused across three security domains; BYOK PBKDF2 fixed global salt

**Status:** 🔄 In Progress — PII leg done, JWT-MAC / signed-URL / BYOK legs deferred (handoff 2026-09-18)

## Handoff (this ticket is multi-leg; only the PII leg landed in this worktree)

**PII leg — DONE** (already landed prior to this batch):
`actorHash` / `chatHash` hash under separate HKDF domains
(`NSFW_PII_ACTOR` / `NSFW_PII_CHAT`) via the shared `hashWithDomain`
helper; module renamed `pii-redact.ts` → `telemetry-id-hashes.ts`.

**Open legs — deferred to dedicated worktree** (out of scope for the
`find-work-batch-tickets` batch per user direction 2026-09-18):

1. **JWT MAC HKDF domain separation** (`src/auth/jwt.ts`)
   - Currently `importSecretKey(secret)` derives the signing key from
     `auth.jwtSecret` raw. Should use `domainKey(secret, DOMAIN_INFO.JWT_SIGN)`
     so a leaked signed-URL HMAC key cannot forge JWTs.
   - **Risk**: any in-flight JWT issued pre-fix will fail verification
     post-fix. Either accept a forced re-auth (rotate `jwtSecret`) or
     support a one-issuance overlap (verify against both old and new
     keys, sign only with new). The two-key overlap adds complexity; the
     rotate approach is simpler and standard.
   - Suggested commit: change `importSecretKey` + `verifyJwt` to derive
     via HKDF, then rotate `AUTH_JWT_SECRET` env in deployment.
   - Tests already cover `signed-url.ts` HKDF domain; mirror for jwt.ts.

2. **signed-URL fallback warn** — already done. `resolveSignedUrlSecret`
   emits a one-shot warn when `assets.signedUrlSecret` is unset and
   falls back to `auth.jwtSecret` (src/assets/controller/signed-url.ts:228-238).
   No further action.

3. **BYOK per-record salt** — already done. `encryptValue` writes
   `salt:iv:ciphertext` (3-chunk wire format); `decryptValue` accepts
   both new and legacy 2-chunk format. Per-record salt is generated
   randomly per call (src/crypto/byok.ts:25-28, 80-88).
   No further action.

**Why deferred**: per user direction 2026-09-18, this batch stopped
at end-to-end-verified scope (migration ordering + activitypub FK).
The JWT-MAC leg is a security-relevant change to the auth surface
and warrants its own dedicated worktree with explicit verification of
token rotation policy before landing.
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
