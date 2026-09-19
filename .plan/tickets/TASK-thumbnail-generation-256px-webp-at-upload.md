<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Thumbnail Generation (256px WebP at upload)

**Status:** ✅ Done
**Priority:** low
**Effort:** Medium
**Summary:** Thumbnail Generation (256px WebP at upload)
**Context:** Epic proposed:epic-asset-thumbnail; tags assets, thumbnails.
**Acceptance Criteria:** See ## Acceptance Criteria below.
**Epic:** proposed:epic-asset-thumbnail
**Tags:** assets, thumbnails

## Summary

Implemented: `thumbnail_path` text column on `assets` (migration 012), 256px
WebP generation on image upload via `sharp`, and a serve-side preference for
the persisted `thumbnail_path` in `handleServeCompressed`. Spec at
`docs/spec/assets.md` line 86.

## Acceptance Criteria

- [x] Implementation complete (migration 012 + create.ts + thumbnail.ts + serve-handlers.ts)
- [x] Tests passing (4 new tests in `src/assets/service/thumbnail.test.ts`)
- [x] Documentation updated (this ticket body + asset schema regenerated)

## Notes

- serve-handlers.ts grew past the per-module size-strict (345-line) gate
  during this work. Extracted `handleServeRaw` and `handleDownload` into a
  new `src/assets/serve-raw.ts` module and re-exported the shared
  `resolveForServe` helper from `serve-handlers.ts`. The router
  (`controller.ts`) and the coverage test were updated to import the
  split surfaces. `variant-path.ts` was carved out for the same reason.
- `sharp` added to `knip.json` `ignoreDependencies`: only reachable
  transitively through `routes/import/actor.ts -> assets/service/create.ts`
  -> `thumbnail.ts`; knip's entry roots do not traverse through the route
  barrel so it falsely reports sharp as unused.
