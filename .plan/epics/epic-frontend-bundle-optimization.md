# EPIC: Frontend Bundle Optimization

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Type:** Optimization Epic
**Tags:** frontend, bundle, code-splitting, lazy-loading, performance

## Summary

Reduce frontend JS bundle size from ~1.34MB to ~134KB (10x reduction) via code-splitting, lazy loading, and chunk optimization. Target: total dist/public JS fits within ~10x MTU per chunk for efficient HTTP/2 streaming delivery.

## Scope

- Analyze current bundle composition and identify bloat
- Implement route-based code-splitting (lazy-load page bundles)
- Lazy-load vendor chunks (Alpine, htmx, extensions)
- Extract shared utilities into a deduplicated chunk
- Enable gzip/brotli compression on build output
- Add bundle size CI gate (soft limit per chunk, hard limit total)
- Remove unused dependencies and dead code
- Remove dead frontend modules (`app.ts`, `touch.ts`, `vendor.ts`, `alpine/locale-picker.ts`)

## Current State

| Bundle           | Size        | Loaded                                                                        |
| ---------------- | ----------- | ----------------------------------------------------------------------------- |
| `app.js`         | 616K        | Always (core framework) — (DEAD — see TASK-remove-dead-frontend-modules)      |
| `pages.js`       | 540K        | Always (all pages)                                                            |
| `vendor.js`      | 116K        | Always (htmx, Alpine, morph) — (DEAD — see TASK-remove-dead-frontend-modules) |
| `chat-vendor.js` | 72K         | Chat page only                                                                |
| **Total**        | **~1.34MB** |                                                                               |

## Target State

| Bundle           | Target Size | Strategy                                             |
| ---------------- | ----------- | ---------------------------------------------------- |
| `app.js`         | <100K       | Strip unused framework code, defer non-critical init |
| `pages.js`       | <80K        | Lazy-load per-page, code-split by route              |
| `vendor.js`      | <50K        | Tree-shake, remove unused extensions                 |
| `chat-vendor.js` | <30K        | Split chat-specific vendor from core vendor          |
| **Total**        | **<260K**   | With compression: <100KB effective                   |

## Linked Tasks

| Task                              | Title                                                                        | Priority | Status      |
| --------------------------------- | ---------------------------------------------------------------------------- | -------- | ----------- |
| TASK-frontend-bundle-analysis     | Analyze bundle composition and identify bloat                                | High     | Not Started |
| TASK-frontend-lazy-pages          | Lazy-load page bundles (code-split by route)                                 | High     | Not Started |
| TASK-frontend-lazy-vendor         | Lazy-load vendor chunks (separate core vs page vendor)                       | High     | Not Started |
| TASK-frontend-dedup-chunks        | Extract shared utilities into deduplicated chunk                             | Medium   | Not Started |
| TASK-frontend-compression         | Enable gzip/brotli pre-compression in build pipeline                         | Medium   | Not Started |
| TASK-frontend-size-gate           | Add bundle size CI gate (soft/hard limits)                                   | Medium   | Not Started |
| TASK-frontend-tree-shake          | Tree-shake unused dependencies and dead code                                 | Low      | Not Started |
| TASK-remove-dead-frontend-modules | Remove dead frontend modules (app.ts, touch.ts, vendor.ts, locale-picker.ts) | High     | Not Started |

## Acceptance Criteria

- [ ] Total JS bundle size < 260KB uncompressed (<100KB compressed)
- [ ] Each chunk < 100KB (10x MTU target for HTTP/2 multiplexing) |
      | [ ] No regression in page load time or interactivity |
      | [ ] Bundle size CI gate added to `bun run check` |
      | [ ] All existing tests pass after optimization |

## Files

- `src/frontend/app.ts` — core framework bundle entry
- `src/frontend/pages.ts` — page-specific behaviors entry
- `src/frontend/vendor.ts` — core vendor bundle entry
- `src/frontend/chat-vendor.ts` — chat-specific vendor entry
- `scripts/build-frontend.sh` — build pipeline (add compression, size checks)
- `dist/public/` — build output

## Notes

- MTU target: ~15KB per chunk → 10x MTU = ~150KB per chunk ceiling
- Compression (gzip/brotli) is already handled by `src/build/compress.ts` — verify ratios
- Bun's built-in bundler supports `splitting` and `lazy` imports — prefer these over manual chunking
- Alpine.js components that are not immediately visible should use dynamic `import()` for lazy registration
