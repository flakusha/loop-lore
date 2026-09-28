<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: safe-buffer: add base64url + throwing variants, audit call sites

**Summary:** Make the safeFrom* API hard to misuse by splitting it by coercion risk - add a base64url variant, add throwing (mustFrom*) variants, and remove the call sites that could never fail.
**Context:** A single mechanical migration (3ecd37e4f) wrapped 11 call sites, of which 4 could never fail and 2 silently substituted a wrong value instead of raising. The memory-audit base64url pagination cursor is the live example of a caller with no correct helper.
**Acceptance Criteria:** safeFromBase64Url round-trips every byte value; mustFrom* throw a typed error over one shared guard implementation; a lint rule or knip query flags safeFromUint8Array(Buffer.from(<string>)); src/memory/audit.ts migrates to the base64url-aware helper; unreachable wrappers are removed.
**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

fix(safe-buffer): make the API hard to misuse, split by coercion risk

The `safeFrom*` family is correct but its shape invites misuse, and a
single mechanical migration (3ecd37e4f) wrapped 11 call sites — of which
4 could never fail, so the wrapper only obscured the code it claimed to
protect, and 2 could fire, where the `r.ok ? r.buffer : fallback` shape
silently substituted a wrong value instead of raising.

Three concrete defects in the current API:

1. **No base64url variant.** `safeFromBase64` decodes with
   `Uint8Array.fromBase64`, which is strict standard-alphabet and
   throws on the `-`/`_` characters base64url emits. Callers holding a
   base64url value (the memory-audit pagination cursor is the live
   example) have no correct helper and will reach for
   `Buffer.from(s, "base64url")` instead. Verified:
   `safeFromBase64(Buffer.from("\\u00fb\\u00ff\\u00fe").toString("base64url"))`
   returns ok=false where the original returns a correct buffer.

2. **`safeFromUint8Array` cannot fail except on size.** It does no
   coercion, so `safeFromUint8Array(Buffer.from(untrustedString))` is
   pure ceremony — the unsafe call is still there one level deeper. It
   invites exactly the mistake the helper exists to prevent.

3. **No throwing variants.** Every consumer wants one of two shapes —
   "return the value or throw" (crypto, anything persisted) or "return
   a Result" (parse-or-default). The library ships only the Result
   shape, so callers hand-roll the decision and reach for `""` or
   `Buffer.alloc(0)` as a default. Both silent fallbacks shipped in
   3ecd37e4f; the follow-up fix had to add explicit `if (!r.ok) throw`
   at every site.

## Scope

- Add `safeFromBase64Url` (and a `BufferEncoding`/`"base64url"` option on
  the existing entrypoint) so base64url callers have a supported path.
- Add `mustFromString` / `mustFromBase64` / `mustFromUint8Array` — same
  guards, `throw` on failure, no Result to destructure. Use these at
  crypto and persistence boundaries.
- Rename or re-scope `safeFromUint8Array` so it cannot be used to launder
  a string→bytes coercion, or document explicitly that it performs no
  coercion and must not wrap `Buffer.from(string)`.

## Acceptance Criteria

- [ ] `safeFromBase64Url` round-trips every byte value through
      `Buffer.from(x).toString("base64url")`
- [ ] `mustFrom*` variants throw a typed error carrying the underlying
      cause, and the `safeFrom*` Result variants are expressible as
      `mustFrom*` internally (one guard implementation, two shapes)
- [ ] A lint rule or knip query flags `safeFromUint8Array(Buffer.from(<string>))`
- [ ] `src/memory/audit.ts` cursor decode/encode migrated to the
      base64url-aware helper
- [ ] Every current call site audited for reachability; unreachable
      wrappers removed rather than left in place

## Notes

`DEFAULT_MAX_SIZE` is 10 MB, which is right for assets and far too large
for a pagination cursor or a key envelope. Per-call-site limits are
already supported as a parameter, but nothing documents which call sites
should pass one. Consider a `DEFAULT_MAX_CURSOR_LEN` and a
`DEFAULT_MAX_KEY_LEN` so the safe default matches the typical use.

Refs: BUG-base64-tobase64-coerces-undefined-to-0-via-bytes-i-0

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
