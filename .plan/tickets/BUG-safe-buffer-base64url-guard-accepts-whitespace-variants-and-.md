<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: safe-buffer: base64url guard accepts whitespace variants and the per-call cap does not bound decode work

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Summary:** `safeFromBase64Url` silently accepts ASCII whitespace, so a value has more than one valid encoded form, and the per-call `maxSize` cap bounds the decoded result rather than the decode work, so an oversized input is fully decoded before it is rejected.
**Context:** Found by adversarial probe while reviewing cb82193b7, which had already merged to dev. Both defects are in code that satisfies the base64 helper ticket's acceptance criteria, so they are gaps in the shipped implementation rather than in that ticket.
**Acceptance Criteria:** See the list under `## Acceptance Criteria` below.

## 1. Whitespace is silently discarded (canonical form is not unique)

`Uint8Array.fromBase64` strips ASCII whitespace before decoding, so `safeFromBase64Url` accepts inputs it should reject:

    safeFromBase64Url("aGVsbG8=\n").ok   === true   -> "hello"
    safeFromBase64Url("aGVs bG8=").ok    === true   -> "hello"
    safeFromBase64Url("!!!!aGVsbG8").ok   === false  (junk IS rejected)

Junk and null bytes are correctly rejected; only whitespace passes. The audit cursor encodes `base64url(json)`, so the canonical encoded form is not unique -- newline, space, tab and CRLF variants of a valid cursor all decode to the same boundary and are all accepted by `memory/audit.ts` `decodeCursor`. A cursor that was truncated, line-wrapped by a proxy, or hand-edited is still honoured as valid.

The guard's stated purpose is to reject malformed input, and the M7 review rejected guards that only obscured the code they claimed to protect. Reject on whitespace rather than normalizing it away, so the accepted set is exactly the canonical alphabet.

## 2. `maxSize` bounds the result, not the work

`guardDecode` pre-checks `encoded.length > DEFAULT_MAX_BASE64_LEN` (a global 20 MB), and only compares `buffer.length > maxSize` AFTER decoding. The per-call cap therefore does not bound decode work:

    safeFromBase64Url("A".repeat(5_000_000), 512)  -> 4.1ms, then rejected at 3,750,000 bytes

`memory/audit.ts` passes `MAX_CURSOR_BYTES = 512` precisely so an oversized request is rejected early, but a 20 MB cursor is fully decoded first. Derive the encoded-length bound from `maxSize` (`ceil(maxSize / 3) * 4`, plus slack for the url alphabet) so the per-call cap actually caps the work.

## Acceptance Criteria

- [ ] `safeFromBase64Url` rejects every input containing ASCII whitespace, with a test per whitespace class (space, tab, LF, CRLF, VT, FF)
- [ ] The encoded-length pre-check derives from `maxSize`, so `safeFromBase64Url(x, 512)` rejects a 1 MB input without decoding it (assert via a payload that would throw if decoded)
- [ ] The canonical-alphabet guarantee is stated in the function JSDoc: accepted input is exactly RFC 4648 s4 or s5 with optional padding
- [ ] `safeFromBase64` has the same whitespace strictness -- the two guards must not diverge again
- [ ] Existing `guards.test.ts` cases still pass, plus a case asserting the 256-byte round-trip is unaffected

## Notes

All five acceptance criteria on the base64 helper ticket are met; these are defects within the shipped implementation, not gaps in that ticket.

The original `decodedResult.ok` pattern this replaced was rejected for substituting a silent default. Silent whitespace stripping is the same class of problem at the decode layer.
