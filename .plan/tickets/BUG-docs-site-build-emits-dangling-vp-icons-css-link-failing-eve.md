<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Docs site build emits dangling vp-icons.css link, failing every docs-mermaid browser e2e page

**Summary:** The docs build links a stylesheet it never emits, so every built page 404s on it and the docs-mermaid browser e2e fails 11/11 even though mermaid renders correctly.
**Context:** withMermaid() (vitepress-plugin-mermaid) injects a `<link href="/docs/vp-icons.css">` into every page, but no such file is written to docs/.vitepress/dist/. vitepress 1.6.4 ships no vp-icons.css at all — its theme icons.css is bundled into assets/style.*.css — so the link dangles by construction.
**Acceptance Criteria:** [ ] `bun test ./tests/e2e/flows/browser/docs-mermaid.browser.ts` passes; [ ] the `e2e - browser (baseline)` gate is green; [ ] no page under docs/.vitepress/dist/ references a missing asset.

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

## Summary

The VitePress build injects a stylesheet link that the build never writes, so every built page 404s on it and the docs-mermaid browser e2e fails 11/11 pages even though mermaid renders correctly.

**Root cause**

docs/.vitepress/config.mts wraps the config in withMermaid() (vitepress-plugin-mermaid, which pulls in vitepress-plugin-icons). The plugin injects:
  <link rel="preload stylesheet" href="/docs/vp-icons.css" as="style">
into every rendered page, but no vp-icons.css is ever written to docs/.vitepress/dist/. vitepress 1.6.4 ships theme-default/styles/icons.css (bundled into assets/style.*.css) and has no file named vp-icons.css anywhere in the package — so the link is dangling by construction.

**Impact**

- tests/e2e/flows/browser/docs-mermaid.browser.ts: 0 pass / 11 fail. trackPageErrors().assert() throws on the single console 404, masking the fact that the mermaid SVG renders fine (verified: .mermaid svg count = 1 on a failing page).
- Fails the 'e2e - browser (baseline)' check gate, blocking giwt finalize.
- The docs site itself is only cosmetically affected (icon CSS is already bundled into style.*.css) — the test is strict about an asset that is not actually needed for the assertion under test.

**Repro**

  bun test ./tests/e2e/flows/browser/docs-mermaid.browser.ts

fails on a clean dev checkout, independent of any working-tree change.

**Candidate fixes** (pick one)

1. Emit the file: a postbuild copy of the icon stylesheet into dist so the link resolves. Least invasive; keeps the test strict.
2. Drop the injection: configure withMermaid/vitepress-plugin-icons so it does not add a vp-icons.css link, since the icon CSS is already inlined into assets/style.*.css.
3. Relax the assertion: have trackPageErrors() tolerate 404s for vp-icons.css specifically. Weakens the gate — only justified if the link is provably inert.

Option 1 is preferred: it removes a real (if cosmetic) 404 from every docs page and leaves the test strict. Whichever is chosen, assert on the mermaid SVG rather than on the absence of unrelated console noise.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
