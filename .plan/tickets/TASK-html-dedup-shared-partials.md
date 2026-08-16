<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Extract Shared HTML Partials

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** High
**Epic:** epic-frontend-html-dedup-htmx-reuse
**Tags:** frontend, htmx, partials, components, deduplication

## Summary

Promote repeated markup identified in the audit into reusable partials/components so each
fragment has a single canonical definition instead of N inlined copies.

## What to Do

1. For each repeated fragment from the audit, extract a shared partial in
   `src/partials/` (or `src/components/` where stateful) mirroring existing partial
   conventions (`src/partials/characters/`, `src/partials/gallery/`, etc.).
2. Replace every duplicate inline copy with an include/reference to the shared fragment.
3. Ensure OOB targets and `Alpine.initTree()` lifecycle still apply post-swap — extracted
   fragments must drop into `htmx.ts` AfterSwap handling unchanged.
4. Preserve server-rendered i18n (`t(...)` partial usage) — do not change locale behavior.

## Acceptance Criteria

- [ ] Every audited duplicate now references one canonical shared fragment
- [ ] No deleted markup changes rendered DOM structure (verified by browser e2e)
- [ ] i18n labels render identically before/after extraction
- [ ] AfterSwap → Alpine init still runs on swapped fragments

## Files

- `src/partials/**` — new shared partials
- `src/components/**`, `src/views/**` — call sites migrated to shared reference
- `src/frontend/alpine/htmx.ts` — lifecycle (unchanged unless a fragment needs a hook)

## Related

- `TASK-html-dedup-audit` — source fragment map
- `TASK-htmx-reuse-e2e-verify` — regression gate
