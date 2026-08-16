<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Lazy-Load Page Bundles (Code-Split by Route)

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-bundle-optimization

## Summary

Split `pages.js` (540K) into per-page lazy-loaded chunks so users only download JS for the page they're on. Currently all page behaviors are bundled into a single `pages.js` loaded on every page.

## Strategy

- Convert page-specific Alpine.js components and htmx handlers to use dynamic `import()`
- Each page route loads its own chunk on navigation
- Shared page utilities remain in a deduplicated common chunk

## Target Structure

```
dist/public/
  app.js          # core framework (~100K target)
  pages/          # per-page chunks (lazy-loaded)
    new-chat.js
    characters.js
    quests.js
    settings.js
    ...
  vendor.js        # core vendor (~50K target)
  chat-vendor.js   # chat-specific vendor (~30K target)
```

## Acceptance Criteria

- [ ] `pages.js` split into per-page chunks
- [ ] Each page chunk < 100KB
- [ ] No page regression (all pages load correctly)
- [ ] Total uncompressed JS < 260KB
- [ ] All existing tests pass

## Files

- `src/frontend/pages.ts` — refactor for code-splitting
- `src/frontend/alpine/` — individual component files
- `scripts/build-frontend.sh` — update build config
