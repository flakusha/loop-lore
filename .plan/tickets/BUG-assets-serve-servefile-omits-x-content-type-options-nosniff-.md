<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: assets serve: serveFile omits X-Content-Type-Options: nosniff, enabling MIME-sniff attacks

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

## Observed
serveFile (assets/serve-file.ts:20-35) sets Content-Type and Cache-Control but does NOT set X-Content-Type-Options: nosniff. Callers handleServeRaw encrypted branch (line 208-213) explicitly adds nosniff for the decrypted path, but the public-raw fallback at line 220 (handleServeRaw) and the compressed-variant fallback at line 268 (handleServeCompressed) go through serveFile without nosniff. An attacker who can point a victim's browser at an asset URL (via stored XSS, link, etc.) can serve SVG-as-script or other MIME-sniff vectors when the asset mime_type is image/svg+xml.

## Expected
All asset-serving responses must include X-Content-Type-Options: nosniff. The simplest fix is to set it once inside serveFile so all callers inherit it.

## Evidence
- src/assets/serve-file.ts:20-35 — Response headers contain Content-Type + Cache-Control only.
- src/assets/serve-handlers.ts:207-213 — encrypted branch sets nosniff explicitly (correct).
- src/assets/serve-handlers.ts:220 — non-encrypted raw fallback calls serveFile WITHOUT nosniff.
- src/assets/serve-handlers.ts:268 — compressed-variant fallback calls serveFile WITHOUT nosniff.
- reproduction: upload an SVG asset. Request /assets/:id/raw without chatId or with public visibility. Response lacks X-Content-Type-Options: nosniff. Browsers may MIME-sniff the SVG body and execute embedded scripts.

## Severity
high

## Fix direction
Add `'X-Content-Type-Options': 'nosniff'` to the headers object in serveFile (src/assets/serve-file.ts:30-34). Remove the explicit nosniff from the encrypted branch in handleServeRaw since serveFile will now provide it centrally.


## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
