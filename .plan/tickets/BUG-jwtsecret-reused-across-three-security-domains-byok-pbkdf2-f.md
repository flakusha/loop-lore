<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: jwtSecret reused across three security domains; BYOK PBKDF2 fixed global salt

**Status:** ✅ Closed — all four legs verified in dev (verified 2026-09-18)

**Priority:** high

**Effort:** Medium

**Type:** BUG

**Context:** jwtSecret + signedUrlSecret + PII hash salt were all
derived from a shared upstream secret. Domain-separated via HKDF in
`src/auth/jwt.ts`, `src/assets/controller/signed-url.ts`, and
`src/nsfw/telemetry-id-hashes.ts`. BYOK switched to per-record random
salt + HKDF-SHA256. All four legs verified — see Resolution above.

## Resolution

All four legs landed in dev ahead of this batch:

1. **PII leg** — `actorHash` / `chatHash` hash under separate HKDF domains
   (`NSFW_PII_ACTOR` / `NSFW_PII_CHAT`) via the shared `hashWithDomain` helper;
   module renamed `pii-redact.ts` → `telemetry-id-hashes.ts`.
2. **JWT MAC leg** — `src/auth/jwt.ts:113-122` `importSecretKey` derives the
   HMAC key via `domainKey(secret, DOMAIN_INFO.JWT_SIGNING, 32)`. Tests at
   `src/auth/jwt.test.ts` exercise the derivation (line 41).
3. **signed-URL fallback warn leg** — `src/assets/controller/signed-url.ts:221-241`
   `resolveSignedUrlSecret` emits a one-shot warn when `assets.signedUrlSecret`
   is unset and falls back to `auth.jwtSecret`. The downstream `signAssetUrl`
   also HKDF-domain-separates the HMAC key. Tested at
   `src/assets/controller/signed-url.test.ts:180-203`.
4. **BYOK per-record salt leg** — `src/crypto/byok.ts` switched from
   fixed-salt PBKDF2 to per-record random salt + HKDF-SHA256; wire format is
   `salt:iv:ciphertext`; decryptValue accepts both new and legacy 2-chunk form.

All four tests green at HEAD: `bun test src/auth/jwt.test.ts src/assets/controller/signed-url.test.ts src/crypto/ src/nsfw/telemetry-id-hashes.test.ts`. No further code change needed.

**Summary:** Four security domains (JWT MAC, signed-URL HMAC, NSFW PII
hash, BYOK KDF) were all derived from a shared upstream secret with weak
key derivation. Fixed by HKDF domain separation + per-record random salt
in BYOK.

**Acceptance Criteria:**

+ [x] Implementation complete
+ [x] Tests passing
+ [x] Documentation updated
