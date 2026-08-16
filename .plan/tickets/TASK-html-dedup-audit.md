<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: HTML Deduplication Audit

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Medium
**Epic:** epic-frontend-html-dedup-htmx-reuse
**Tags:** frontend, htmx, partials, deduplication

## Summary

Map every repeated HTML fragment across `src/components/`, `src/partials/`, and
`src/views/` so the dedup epic has a concrete, quantified target. This is the discovery
task that feeds all others.

## What to Do

1. Enumerate fragments in `src/components/` (incl. `chat/`, `modals/`),
   `src/partials/` (characters, gallery, worlds), and `src/views/`.
2. Compare blocks (modals, headers, list rows, form shells, OOB targets) for near-duplicate
   markup; record canonical vs. duplicate occurrences.
3. Note views that re-declare `hx-*` request attributes (swap targets, OOB, error
   handling) rather than reusing `src/frontend/alpine/htmx.ts` / `htmx-header.ts`.
4. Write findings to the epic's `## Current State` (fragment map + line counts).

## Acceptance Criteria

- [ ] Fragment map lists each repeated block with file:line occurrences
- [ ] Canonical source identified per fragment (or "no reusable source yet")
- [ ] Inventory of views re-declaring htmx request attributes
- [ ] Line-count deltas for the top repeated fragments

## Files

- `src/components/**`, `src/partials/**`, `src/views/**` — audit surface
- `src/frontend/alpine/htmx.ts`, `htmx-header.ts` — ajax request patterns

## Related

- `TASK-html-dedup-shared-partials` — consumes this audit
- `TASK-htmx-ajax-request-helper` — consumes the htmx-attribute inventory
