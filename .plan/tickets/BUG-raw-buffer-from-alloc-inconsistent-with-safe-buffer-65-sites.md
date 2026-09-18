<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: raw Buffer.from/alloc inconsistent with safe-buffer — 65 sites

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Resolved (audited + boundary sites routed, 2026-09-15)
**Priority:** low
**Effort:** Medium
**Epic:** epic-code-quality

## Summary

**Severity**: NIT

**Scope**: 65 call sites use raw `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe` without routing through `src/utils/safe-buffer/`.

**Root cause**: project has `src/utils/safe-buffer/` (`safeFromUint8Array`, `safeFromBase64`, `safeCompress`, `safeFromString`) — provides consistent error handling and avoids unsafe `allocUnsafe` in hot paths. Many existing sites are fine (encoding specified), but new code and untrusted/arrayBuffer paths should prefer the safe utils.

**Fix direction**:

- New code: always use `safe-buffer` utils.
- Existing: audit untrusted-input paths (`Buffer.from(userInput)`, `Buffer.from(arrayBuffer)`) — route those through `safeFromUint8Array`. Trusted fixed-encoding sites (`Buffer.from(str, 'utf8')`) are acceptable as-is.
- Use `safeFromBase64` for base64 decode paths.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Resolution (2026-09-15)

Two-pass audit, both merged to `dev`:

- Pass 1 (commits `b5e9358b7` + tests): network/file/DB boundaries —
  `matting/providers.ts:43` (remote HTTP bytes), `matting/service.ts:166`
  (disk read), `memory/embeddings.ts` (vector store + DB, 3 sites),
  `federation/cipher.ts` seal, `export-shared/assets.ts` + `helpers.ts`
  (dropped pointless `Buffer.from` copy; `CryptoHasher.update` takes the
  `Uint8Array`). New tests: `matting/providers.test.ts` (PNG/non-PNG/HTTP-500),
  `export-shared/assets.test.ts` (real-file zip + checksum).
- Pass 2 (commit `06c13fa3e`): `federation/cipher.ts` seal/open completed
  plus all 8 `peer-keys.ts` key-wrap sites through `safeFromUint8Array` /
  `safeFromBase64` / `safeToBase64`. Key-decode failure is fail-closed
  (thrown guard error at wrap time). `steganography.ts` verified clean
  (no Buffer refs).
- Deliberately untouched: fixed-encoding trusted paths (`utf8`/`base64`/
  `latin1` literals, magic bytes, constant-size `alloc`) per the ticket's own
  trust rule; `peer-keys` empty-key rotation semantics preserved.
- Verify: 69/69 `src/federation/` tests pass; full `check` + `test:unit`
  green on both finalizes.

## Prior audit note (superseded by Resolution above)

Extended the first pass (network/file/DB boundaries, merged earlier):
`federation/cipher.ts` seal/open plus all 8 `peer-keys.ts` key-wrap sites
now route through `safe-buffer`. `steganography.ts` has no Buffer refs
(already clean). 69/69 `src/federation/` tests pass.