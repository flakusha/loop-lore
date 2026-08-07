# TASK: CSS deduplication (jscpd:full)

**Status:** ✅ Done (worktree `css-dedup`, commit pending)
**Priority:** Medium
**Effort:** Medium

## Summary

Deduplicate CSS detected by jscpd:full (108 clones, 861 dup lines / 17.94%): app.css internal clones, VN styles duplication, theme file shared blocks, gallery/app overlap. Gate: jscpd:full css clones drop substantially.

## Result

| Metric            | Before        | After         |
| ----------------- | ------------- | ------------- |
| Clones            | 108           | 70 (-35%)     |
| Duplicated lines  | 861 (17.94%)  | 431 (10.00%)  |
| Duplicated tokens | 8558 (20.59%) | 5238 (13.49%) |
| Total CSS lines   | 4800          | 4312 (-488)   |

Remaining 70 clones are jscpd tokenizer noise (comment/brace subsequence matches, values-differing theme structure matches) — not full-rule duplicates.

## Changes

- **VN duplication (~21 clones, ~330 lines)**: `src/frontend/vn/styles.css` was dead code (never served — only `src/public/**` maps to `/`). Its content duplicated app.css's VN section. Consolidated both into served `src/public/css/vn.css` (core VN + `.vn-stop` + GM panel + choice cards + loading + attachments), deleted the dead file, removed the VN section from app.css, linked `/css/vn.css` in layout.html. **Fixed latent bug**: choice-card/loading/attachments styles existed only in the unserved file, so those UI elements were unstyled in production.
- **app.css internal clones**: merged 32 groups of byte-identical declaration bodies into comma-selector lists (e.g. `.nav-item:hover, .nav-item.active, …`). 447/447 selectors preserved. Excluded global `:focus-visible` from merging (would regress `:focus { outline: none }` keyboard ordering).
- **theme.css**: removed dead fallback `:root` token block (83 lines duplicating theme-default + theme-base).
- **theme-no-icons.css**: fixed misplaced accent-alpha/font-size tokens scoped inside `.theme-no-icons .badge .text` (they never applied at `:root`); moved accent-alpha block into `:root`.
- **gallery.css**: merged `.gallery-upload-area .text` + `.gallery-empty .text`.

## Verification

- `bun run check`: typecheck (backend/frontend/coverage), lint-css, lint-html, md-lint, db schema gate, size-check, context, unit tests, e2e tests — all PASS. Remaining failures (lint-ts, format-dprint, size-strict) are pre-existing tracked debt (TASK-PLAN-LINT-TS-DEBT, TASK-PLAN-SIZE-STRICT-DEBT); no touched file appears in them.
- Browser smoke test (server boot + Chromium): all 15 stylesheets 200, zero request failures, merged 6-selector group live, theme tokens resolve, no-icons theme accent-alpha tokens now compute at `:root`.
- `bun run build:frontend` passes; `vn.css` copied to dist with compression variants.

## Acceptance Criteria

- [x] Implementation complete
- [x] Tests passing (unit + e2e; check gates above)
- [x] Documentation updated (docs/frontend/chat/visual-novel-mode.md)
