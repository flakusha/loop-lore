<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Task: Unified Search Frontend Page

**Epic:** epic-creative-studio.md (MVP Tier 1)
**Status:** ⬜ Not Started
**Effort:** Medium
**Depends On:** TASK-creative-studio-search-api

## Goal

Create a dedicated search/browse page in Creative Studio with filter panel and result grid.

## Acceptance Criteria

- [ ] Creative Studio page at `/creative-studio` (or `/notes` tab)
- [ ] Search input with real-time full-text search
- [ ] Type filter chips (Notes, Memories, Items, Worlds, Locations)
- [ ] Chat dropdown filter
- [ ] Interaction/Turn dropdown filter
- [ ] Status filter (All, Active, Inactive, Expired)
- [ ] Sort options (Relevance, Newest, Oldest, TTL)
- [ ] Result cards with type badge, title, content preview, metadata
- [ ] Pagination (infinite scroll or next/prev)
- [ ] Click result → open detail modal

## Implementation

- Use htmx for dynamic loading
- Alpine.js for filter state
- CSS grid for result layout
- Integrate with unified search API

## Files to Create/Modify

- `src/frontend/creative-studio/search-page.ts` (new)
- `src/frontend/creative-studio/search-filters.ts` (new)
- `src/frontend/creative-studio/search-results.ts` (new)
- `src/frontend/creative-studio/styles.css` (new)
