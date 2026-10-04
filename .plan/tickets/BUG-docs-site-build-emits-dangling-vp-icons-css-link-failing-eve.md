<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Docs build dies mid-render on case-colliding plan pages, leaving every page 404ing on vp-icons.css

**Summary:** Thirteen stray UPPERCASE ticket files case-collided with their indexed lowercase originals, orphaning a VitePress SSR chunk import. The build threw before its `buildEnd` hook, so `vp-icons.css` was never written and every rendered page 404'd on it.
**Context:** VitePress derives each page's SSR chunk name from the page path relative to `srcDir`, so `BUG-foo.md` and `BUG-FOO.md` yield chunks differing only by case. Vite resolves the collision by renaming one to `...foo2.md.js`, but the page-to-chunk map still expects the original name, so the dynamic import inside `renderPage` throws `ERR_MODULE_NOT_FOUND`.
**Acceptance Criteria:** [ ] no case-insensitive filename collisions under `.plan/tickets` or `.plan/epics`; [ ] `bun run docs:build` exits 0 and writes `docs/.vitepress/dist/vp-icons.css`; [ ] `bun test ./tests/e2e/flows/browser/docs-mermaid.browser.ts` passes.

**Status:** Done
**Priority:** high
**Effort:** Small

## Summary

`bun run docs:build` crashed during the page-render phase, so `docs/.vitepress/dist/` retained stale output. That stale output still carried VitePress core's own `<link rel="stylesheet" href="/docs/vp-icons.css">` while the stylesheet was absent, so every page 404'd and the docs-mermaid browser e2e failed.

**Root cause**

Thirteen `.plan/tickets/*.md` files existed in UPPERCASE alongside their indexed lowercase originals — the same slug differing only in letter case. All thirteen were added by `87c3b9717 chore(plan): expand plan with backlog + matrix + epic triage`; only the lowercase file is referenced by `.plan/tickets/index.json`, so the uppercase copies are unindexed leftovers.

The page-to-chunk map then pointed one of each pair at a chunk name that Vite had renamed to resolve the collision. Because that failure surfaces whichever colliding page the bundler reaches first, **the build named a different file on each run**, which is why the crash looked unrelated to any recent change.

The throw happens during page rendering, **before** the `buildEnd` hook that writes `vp-icons.css` and `hashmap.json`. That is the actual reason the stylesheet is missing: a downstream symptom of the crash, not a defect in `vitepress-plugin-mermaid` or `vitepress-plugin-icons`. The `<link>` is emitted by VitePress core itself.

**Impact**

- `tests/e2e/flows/browser/docs-mermaid.browser.ts`: 0 pass / 11 fail, masked by the single console 404 while the mermaid SVG itself rendered correctly.
- Blocked the `e2e - browser (baseline)` gate and therefore `giwt finalize`.
- Neither `vp-icons.css` nor `hashmap.json` was ever emitted, so a publish would have shipped a dangling stylesheet link on every page.

**Resolution**

Deleted the thirteen stray UPPERCASE duplicates. After removal `bun run docs:build` exits 0 with no errors and emits both `vp-icons.css` and `hashmap.json`, and the docs-mermaid e2e is green.

**Recurrence risk**

`giwt plan validate` has no gate rejecting case-insensitive filename collisions under `.plan/`, so any tool that creates a ticket from an UPPERCASE `extid` can reintroduce this and silently break the docs build. The guard belongs in giwt (`/home/flak/git-ai/giwt`), which owns plan validation; loop-lore only invokes it.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing
- [x] Documentation updated

## Remaining

The ticket's recurrence-risk note stands: `giwt plan validate` still has no case-insensitive-collision gate. A future ticket creating a ticket from an uppercase extid can reintroduce this break. This is a giwt concern, not a loop-lore concern.

