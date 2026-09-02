<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: HSTS header missing from response policy

**Status:** [OK] Resolved (worktree fix-hsts-response-policy)

**Priority:** low

**Effort:** Small

## Summary

Added an `hsts` config block on `HeadersConfig` with the standard
RFC 6797 fields (enabled, maxAge, includeSubDomains, preload).
Default `enabled: false` keeps plain-HTTP dev working. The
`ResponseHeaderPolicy.emit()` only emits the header when the
request URL protocol is `https:`, so HTTP deployments stay
unaffected.

## Files

- `src/config/schema/headers.ts` — new `HstsConfig` interface,
  wired into `HeadersConfig`
- `src/config/sections/headers.ts` — `HEADERS_DEFAULTS.hsts` +
  `HeadersSection.hsts`
- `src/config/schema-class/json-schema/headers.ts` — JSON schema
  block with the same defaults
- `src/middleware/response-headers.ts` — emit
  `Strict-Transport-Security` on HTTPS when enabled
- `src/middleware/response-headers.test.ts` — 5 new HSTS tests

## Tests

`bun test src/middleware/response-headers.test.ts` — 23/23 pass
(18 pre-existing + 5 new). `bun test src/middleware/` — 216/216 pass.

## Bonus fixes bundled in the commit

Both surfaced during tsc on the H6 changes:

- `src/chat/service/batch.ts` — H4 transaction wrapper dropped
  trailing `return ownedIds.length;`; restored so the function
  matches its `Promise<number>` signature.
- `src/routes/messages/reply.ts` — H3 swipe-retry restructuring
  left `maybeAutoReply` falling off the end without `return { replied:
  false, };` on the no-assistant branch; restored.

Both were latent (guarded by earlier returns in the same function
body), but tsc correctly flags them. Restoring them in the H6
commit was the cheapest path to a clean `bun run check` — separating
them into a third commit would have required another worktree
finalize round-trip without adding value.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (5 new HSTS tests, 216/216 middleware)
- [x] Documentation updated (this ticket + code comments)
