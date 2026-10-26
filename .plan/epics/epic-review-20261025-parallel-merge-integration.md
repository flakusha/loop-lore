<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Parallel-Merge Integration Sweep (2026-10-25 review round E-2)

**Status:** Not Started
**Status Note:** Filed from the 2026-10-25 post-merge review round
**Priority:** Medium
**Effort:** Large
**Type:** Feature Epic
**Tags:** integration, parallel-merge, story-state, translation, review-2026-10-25

**Overview:** (see sections below)

## Summary

Parallel workstreams merged without integration: each half works in isolation and has passing tests; the merged whole does not (review-surfaces.md cluster 1). Wire the FE/BE halves together across story-state, translation, and shared chat partials.

## Scope

1. Story controls + story-states schema: wire FE story controls to the actual BE mount (defects tracked in 7ff9731 story-controls mount and BUG-065ca42 story-states schema drift); align NpcStateBody/LocationStateBody with handlers and make the e2e assert written rows.
2. Decide server-attach vs client translate for the `?translateLocale=` read-time attach (S-8): the server-side negotiation+attach path has zero shipped-client consumers while the client-side `message-translate` flow covers the same UI with separate caches and locale precedence.
3. Invoke the outfit-change detector: `detectOutfitEvent` (src/regex/outfit-events.ts:77) has zero production importers — wire detection into the assistant-reply path (F-4).
4. Dedupe the music-embed renderer: `music-embed.html` partial is orphaned; message-list.html carries a byte-similar inline copy (S-10) — single mount point for the XSS-sensitive renderer.

## Tickets

- Note: the story-states schema-drift BUG (065ca42) and the B-8 duplicate (7ff9731) carry the defects; this epic coordinates the sweep.
- Related: 08ed4c6 (existing outfit-change hook task)
- Findings: F-4, S-8, S-10 in .tmp/reviews/2026-10-25/ (review-core.md / review-surfaces.md)

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round).


git issue: d0e1be1
