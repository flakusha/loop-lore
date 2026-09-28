<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: safe-buffer: base64url guard accepts whitespace variants and the per-call cap does not bound decode work

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** Five defects in the safe-buffer base64url work on dev. Two behavioural: `safeFromBase64Url` silently accepts ASCII whitespace, so a value has more than one valid encoded form, and the per-call `maxSize` cap bounds the decoded result rather than the decode work. Three structural: the audit cursor encoder was left unmigrated, three of the four new `mustFrom*` exports have no production caller, and the barrel omits the size constants.
**Context:** Found by adversarial probe while reviewing cb82193b7, which had already merged to dev. Sections 1-2 are behavioural gaps in code that satisfies the base64 helper ticket's acceptance criteria. Sections 3-5 are the ticket's own criteria (cursor decode/encode migrated, unreachable wrappers removed) applied to what the ticket itself added, which the original review did not cover.
**Acceptance Criteria:** See the list under `## Acceptance Criteria` below.

## 1. Whitespace is silently discarded (canonical form is not unique)

`Uint8Array.fromBase64` strips ASCII whitespace before decoding, so `safeFromBase64Url` accepts inputs it should reject:

    safeFromBase64Url("aGVsbG8=\n").ok   === true   -> "hello"
    safeFromBase64Url("aGVs bG8=").ok    === true   -> "hello"
    safeFromBase64Url("!!!!aGVsbG8").ok   === false  (junk IS rejected)

Junk and null bytes are correctly rejected; only whitespace passes. Measured against the real cursor path: truncated cursors (90%, 50%, 25% kept), non-JSON payloads, `{}`, and payloads over the 512-byte cap are all correctly rejected. The one accepted-but-invalid form is whitespace -- trailing, leading and embedded newline/space/CRLF variants of a valid cursor all decode to the same boundary and are all accepted by `memory/audit.ts` `decodeCursor`. So a cursor that was line-wrapped by a proxy or had whitespace injected is honoured as valid, while genuinely corrupted ones are not.

The guard's stated purpose is to reject malformed input, and the M7 review rejected guards that only obscured the code they claimed to protect. Reject on whitespace rather than normalizing it away, so the accepted set is exactly the canonical alphabet.

## 2. `maxSize` bounds the result, not the work

`guardDecode` pre-checks `encoded.length > DEFAULT_MAX_BASE64_LEN` (a global 20 MB), and only compares `buffer.length > maxSize` AFTER decoding. The per-call cap therefore does not bound decode work:

    safeFromBase64Url("A".repeat(5_000_000), 512)  -> 4.1ms, then rejected at 3,750,000 bytes

`memory/audit.ts` passes `MAX_CURSOR_BYTES = 512` precisely so an oversized request is rejected early, but a 20 MB cursor is fully decoded first. Derive the encoded-length bound from `maxSize` (`ceil(maxSize / 3) * 4`, plus slack for the url alphabet) so the per-call cap actually caps the work.

## 3. The cursor encoder was not migrated

The ticket criterion was that the audit cursor decode/encode be migrated to the base64url-aware helper. Only the decode half was:

    src/memory/audit.ts:103  safeFromBase64Url(cursor, MAX_CURSOR_BYTES,)   // migrated
    src/memory/audit.ts:125  Buffer.from(...).toString("base64url",)        // NOT migrated

`encodeNextCursor` still uses a raw `Buffer` with no size cap and no guard. It is a small local string today so it cannot exceed the decode cap, but the asymmetry is exactly the drift the "one guard implementation" criterion was meant to prevent: a future caller can emit a cursor the decoder will reject, and nothing in the types or tests catches that. Route it through `mustFromString` (or `safeToBase64` where that exists) so encode and decode share one code path.

## 4. The throwing family is unused API

The ticket criterion was "every current call site audited for reachability; unreachable wrappers removed rather than left in place". That audit was applied to the pre-existing call sites but not to the four functions the ticket itself added. Measured production callers, excluding the module and its tests:

    mustFromBase64      1 call site  (src/generation/image-engine/helpers.ts:31)
    mustFromBase64Url   0 call sites
    mustFromString      0 call sites
    mustFromUint8Array  0 call sites

For comparison the Result family is genuinely used: `safeFromUint8Array` 16, `safeFromBase64` 8, `safeFromString` 6, `safeFromBase64Url` 1. Three of the four new exports have no production caller. Knip does not flag them because the test files reference all four, so dead-code detection treats them as live -- a test asserting a wrapper's behaviour is not evidence the wrapper is reachable.

Decide explicitly: either wire them where a throw is correct, or drop the three unused ones. Leaving them makes `mustFrom*` look like an established pattern to the next caller while the only proven instance is the one that `decodeImages` catches and maps to a 502.

## 5. The barrel does not re-export the size constants

`src/utils/safe-buffer/index.ts` exports the eight functions and `SafeBufferError`, but not `DEFAULT_MAX_SIZE`, `DEFAULT_MAX_BASE64_LEN`, `DEFAULT_MAX_RATIO`, `MAX_CURSOR_LEN` or `MAX_KEY_LEN`. A caller therefore cannot size a payload against a cap without reaching into the deep path.

This is not hypothetical. During review, `safeBuffer.DEFAULT_MAX_SIZE` resolved to `undefined` from the barrel, so `"x".repeat(DEFAULT_MAX_SIZE + 1)` built a zero-length string and every oversize assertion silently degraded into testing the empty string -- which passes. Re-export the constants so a test or caller cannot silently assert nothing.

## Acceptance Criteria

- [ ] `safeFromBase64Url` rejects every input containing ASCII whitespace, with a test per whitespace class (space, tab, LF, CRLF, VT, FF)
- [ ] The encoded-length pre-check derives from `maxSize`, so `safeFromBase64Url(x, 512)` rejects a 1 MB input without decoding it (assert via a payload that would throw if decoded)
- [ ] The canonical-alphabet guarantee is stated in the function JSDoc: accepted input is exactly RFC 4648 s4 or s5 with optional padding
- [ ] `safeFromBase64` has the same whitespace strictness -- the two guards must not diverge again
- [ ] Existing `guards.test.ts` cases still pass, plus a case asserting the 256-byte round-trip is unaffected
- [ ] `encodeNextCursor` routes through a safe-buffer helper, and a round-trip test proves an encoded cursor is always decodable (section 3)
- [ ] Each `mustFrom*` export either gains a production caller or is deleted; the decision is recorded in the ticket (section 4)
- [ ] `index.ts` re-exports the size constants, and a test imports them from the barrel to prove they resolve (section 5)

## Notes

All five acceptance criteria on the base64 helper ticket are met; these are defects within the shipped implementation, not gaps in that ticket.

The original `decodedResult.ok` pattern this replaced was rejected for substituting a silent default. Silent whitespace stripping is the same class of problem at the decode layer.
