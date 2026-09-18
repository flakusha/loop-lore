<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: CSP unsafe-inline defeats per-request nonce

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** [OK] Done
**Priority:** high
**Effort:** Medium

## Summary

Location: src/config/sections/headers.ts (CSP_DEFAULTS.scriptSrc = ["'self'", "'unsafe-inline'", "'unsafe-eval'"]) and src/middleware/response-headers.ts (buildCsp injects 'nonce-...' into script-src).

Symptom: The per-request CSP nonce (generateNonce + WeakMap + injected into inline <script nonce> in layout.ts) is DEFEATED because script-src also contains 'unsafe-inline'. Demonstrated at runtime: emitted header is `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'nonce-XXXX'`. 'unsafe-inline' permits any inline script regardless of nonce, so the nonce machinery is security theater against inline XSS. The app handles user-generated content via htmx/Alpine, so inline-script XSS is a realistic threat.

Root cause: 'unsafe-inline' kept for Alpine compatibility, but Alpine attributes (x-*, @click) are HTML attributes (CSP does not govern them) and only need 'unsafe-eval' (already present). Inline <script> blocks should carry the nonce instead.

Fix (COUPLED — see Acceptance): drop 'unsafe-inline' from scriptSrc; keep nonce + 'unsafe-eval' + 'self'. Pair with template changes: (1) add nonce="{{cspNonce}}" to every inline <script> in htmx-swapped fragments — at minimum src/routes/views/character-edit-form.ts:150 emits an un-nonced inline <script>; (2) replace the 20 raw inline event handlers (onclick= etc.) across 10 template/frontend files with Alpine x-on:/@click or addEventListener, OR add 'unsafe-hashes' (weaker). Without (1)+(2) removing 'unsafe-inline' breaks the page.

Acceptance: emitted CSP has no 'unsafe-inline'; all inline <script> in served HTML carry the nonce; no raw on* handlers remain (or 'unsafe-hashes' documented); inline-script XSS demo is blocked; existing UI flows (character edit, chat) still work; regression test asserts CSP excludes 'unsafe-inline'.

## Resolution

Closed on 2026-09-15 across five signed commits on dev (b73cdaf05..b7c3a14d2):

  b73cdaf05 fix(security): drop unsafe-inline csp and nonce inline scripts
    - drops 'unsafe-inline' from CSP_DEFAULTS, injects nonce into the
      inline <script> in character-edit-form.ts, migrates 11
      view-output on*= handlers to Alpine x-on:
  f714d76d6 fix(security): migrate remaining CSP-blocked event handlers to addEventListener
    - strict-review found 4 more on*= sites that would be silently
      blocked by the round-1 fix: avatar upload + aspirations editor
      (silently referenced module-private `aspirationsData` so they
      were already broken ReferenceError) + memory checkbox + new-chat
      selection chips. All migrated to createElement + addEventListener.
  761cd0488 fix(security): bump size-allow for characters-traits
    - characters-traits.ts grew from 275L to 309L after the createElement
      rewrite; bumped size-allow to 320L.
  788270146 fix(security): extend CSP sweep to innerHTML sinks
    - second sweep in src/middleware/csp-shipped-html.test.ts covers
      src/frontend/pages/** for innerHTML template-literal assignments
      with on*=. Multi-line template-literal-aware scan (4 KB lookahead)
      with dedupe via break-after-first-offender-per-file.
  b7c3a14d2 fix(security): dprint-format innerHTML sweep IIFE
    - dprint wanted the catch-IIFE on its own block.

Verified:
- typecheck - backend + frontend: PASS
- lint - oxlint (correctness): PASS
- format - dprint: PASS
- md - lint: PASS
- db - schema gate: PASS
- size - check + size - strict: PASS
- lint:eslint: RC=0 (0 errors, 2231 warnings — pre-existing warnings, not new)
- bun run test:unit: 10905 pass, 1 skip, 0 fail, 43562 expects, 1029 files
- CSP regression tests: 55/55 pass across csp-shipped-html, csp-nonce,
  response-headers, characters-traits
- Mutation tests (3 shapes):
  - shipped HTML onclick → sweep reports character-edit-form.ts:178
  - multi-line innerHTML onclick → sweep reports characters.ts:62
  - same-line innerHTML onclick → sweep reports shared.ts:84

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated
