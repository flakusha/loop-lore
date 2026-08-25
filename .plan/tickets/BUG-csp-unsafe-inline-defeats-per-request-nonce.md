# BUG: CSP unsafe-inline defeats per-request nonce

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Location: src/config/sections/headers.ts (CSP_DEFAULTS.scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]) and src/middleware/response-headers.ts (buildCsp injects 'nonce-...' into script-src).

Symptom: The per-request CSP nonce (generateNonce + WeakMap + injected into inline <script nonce> in layout.ts) is DEFEATED because script-src also contains 'unsafe-inline'. Demonstrated at runtime: emitted header is `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-XXXX'`. 'unsafe-inline' permits any inline script regardless of nonce, so the nonce machinery is security theater against inline XSS. The app handles user-generated content via htmx/Alpine, so inline-script XSS is a realistic threat.

Root cause: 'unsafe-inline' kept for Alpine compatibility, but Alpine attributes (x-*, @click) are HTML attributes (CSP does not govern them) and only need 'unsafe-eval' (already present). Inline <script> blocks should carry the nonce instead.

Fix (COUPLED — see Acceptance): drop 'unsafe-inline' from scriptSrc; keep nonce + 'unsafe-eval' + 'self'. Pair with template changes: (1) add nonce="{{cspNonce}}" to every inline <script> in htmx-swapped fragments — at minimum src/routes/views/character-edit-form.ts:150 emits an un-nonced inline <script>; (2) replace the 20 raw inline event handlers (onclick= etc.) across 10 template/frontend files with Alpine x-on:/@click or addEventListener, OR add 'unsafe-hashes' (weaker). Without (1)+(2) removing 'unsafe-inline' breaks the page.

Acceptance: emitted CSP has no 'unsafe-inline'; all inline <script> in served HTML carry the nonce; no raw on* handlers remain (or 'unsafe-hashes' documented); inline-script XSS demo is blocked; existing UI flows (character edit, chat) still work; regression test asserts CSP excludes 'unsafe-inline'.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
