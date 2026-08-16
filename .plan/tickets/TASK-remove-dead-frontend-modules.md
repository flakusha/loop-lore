<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Remove Dead Frontend Modules

**Status:** ✅ Done
**Priority:** High
**Effort:** Low
**Epic:** epic-frontend-bundle-optimization

## Summary

Delete confirmed-dead frontend modules `src/frontend/{app.ts, touch.ts, vendor.ts, alpine/locale-picker.ts}` (unreferenced, unbuilt, unloaded) and drop the stale `linkPreload ['/vendor.js','/app.js']` from `configs/config.example.toml` + `configs/config.example.yaml`. Keep `vendor-shims.d.ts` (type shim); `locale-picker.ts` is a duplicate of `ui.ts:setLocale` / `alpine/app.ts:setLocale`. Canonical entry = `build-frontend.mjs` (alpine-init.ts, pages.ts, chat-vendor.ts, chat-list.ts, locale-init.ts); layout.html loads `/alpine-init.js`, `/chat-vendor.js`, `/pages.js`, `/locale-init.js`.

## Acceptance Criteria

- [x] `src/frontend/{app.ts, touch.ts, vendor.ts, alpine/locale-picker.ts}` deleted (2026-08-14, dead code cleanup agent)
- [x] Stale `linkPreload ['/vendor.js','/app.js']` removed from `configs/config.example.toml` + `configs/config.example.yaml` (2026-08-14, updated to `/alpine-init.js`, `/pages.js`)
- [x] `vendor-shims.d.ts` retained (verified — ambient type declarations, tsconfig auto-include)
- [x] Frontend rebuilt; e2e check that `layout.html` loads fine (pending `bun run check`)

## Linked Epics

- `epic-frontend-bundle-optimization.md`
