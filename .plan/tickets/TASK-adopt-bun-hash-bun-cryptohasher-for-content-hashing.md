# TASK: Adopt Bun.hash / Bun.CryptoHasher for content hashing

**Status:** 🟢 Partial (adopted in `adopt-bun-features`)
**Priority:** medium
**Effort:** Medium

## Summary

Standardize hashing on Bun.hash (wyhash/xxhash for dedup) and Bun.CryptoHasher (SHA-256/512 for crypto). Faster than node:crypto, consistent API.

## Acceptance Criteria

- [x] Implementation complete (sha256 path in `src/middleware/auth/token.ts` and `src/routes/export-shared/helpers.ts`; commit `185029f2 perf(crypto): adopt Bun.CryptoHasher for sha256 hashing`)
- [x] Tests passing (`src/middleware/auth.test.ts` 11/11, `src/routes/sessions.test.ts` + `src/routes/export-shared.test.ts` + `src/routes/export.test.ts` 31/31)
- [x] Documentation updated (inline lean-ctx comments + JSDoc on the new `sha256Hex(token)` helper in `src/middleware/auth/token.ts`)

## Adoption status (2026-08-27)

Adopted for sha256 in two production paths. Verified byte-identical output to `node:crypto.createHash("sha256")` against test vectors (e.g. `"hello-token-1"` produces `7961a7f6...` via both APIs), so existing `sessions.token_hash` rows remain readable.

Remaining work (deferred — out of scope for one worktree):

- `Bun.hash` (wyhash/xxhash) for dedup use cases (not present in repo today; would be net-new adoption).
- Migrate the remaining `crypto.createHash` call sites already documented as byte-identical-safe (test fixtures, e2e helper `tests/e2e/helpers/server.ts`).
