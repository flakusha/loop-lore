<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Chat Room Filters

**Status:** 🟡 Partial — frontend filter component shipped (`alpine/chat-filters.ts`, sidebar chips → query params) + server-side type/archived/sort filters on `GET /api/v1/chats` (`routes/chats/list.ts`); extended filters world / min-messages / max-messages / updated-since shipped (2026-08-16, BE `routes/chats/list.ts` + FE `chat-list-panel.html`); tags filter pending (no tags table in schema)
**Priority:** Medium
**Effort:** Med
**Epic:** Epic 24 (Filtering & Pagination), Epic 36 (Chat Lifecycle)
**Tags:** chat, filter, ux, sidebar
**Spec:** `docs/frontend/chat/search-and-filter.md` §Chat Room Filters

## Summary

Add filter chips and dropdown filters to the chat sidebar, allowing users
to narrow their chat list by type, world, tags, participant count, message
count, activity date, and more. Combined filter support fills the Epic 24 gap.

## Rationale

- Users with many chats need to find specific conversations quickly
- Filtering by world, type, or activity is a common pattern
- Epic 24 (Filtering & Pagination) defines general filter infra but has
  no chat-specific implementation
- Current sidebar only has basic text search, no structured filters

## Current State

- Sidebar chat list: flat, most-recent-first, no filters
- Basic client-side search exists (substring on character name)
- `src/components/filter-bar.html` and `src/components/filter-chips.html`
  exist for gallery/characters — can be reused
- Epic 24 is ⬜ Not Started — no general filter API

## Architecture

### Filter Dimensions

| Filter            | Type         | Implementation               |
| ----------------- | ------------ | ---------------------------- |
| Type              | Chips        | All / Direct / Group         |
| World             | Dropdown     | All worlds / specific        |
| Tags              | Multi-select | Character/chat tags          |
| Participant count | Range        | 1 / 2 / 3-5 / 6+             |
| Message count     | Range        | <10 / 10-50 / 50-200 / 200+  |
| Has attachments   | Toggle       | Only chats with media        |
| Last active       | Dropdown     | Today / Week / Month / Older |
| Pinned            | Toggle       | Only pinned chats            |
| Has world         | Toggle       | World-linked vs freeform     |

### Filter State

```typescript
interface ChatFilters {
  type?: "direct" | "group";
  world?: string; // world ID
  tags?: string[]; // tag names
  participantCount?: string; // "1" | "2" | "3-5" | "6+"
  messageCount?: string; // "<10" | "10-50" | "50-200" | "200+"
  hasAttachments?: boolean;
  lastActive?: "today" | "week" | "month" | "older";
  pinned?: boolean;
  hasWorld?: boolean;
}
```

Persisted in `localStorage` under `chat-sidebar-filters`.

### API

```typescript
// Server-side filter
GET /api/chats
  ?type=group
  &world=<id>
  &minParticipants=2
  &maxParticipants=5
  &minMessages=10
  &activeSince=2026-07-14
  &pinned=true
  &hasWorld=true
  &limit=20
  &offset=0
```

Filters compose with AND logic. Omitted parameters = no filter on that dimension.

### Combined Filter Support (Epic 24 Gap)

The general filtering infrastructure from Epic 24 is needed for full
server-side combined filters. For v1:

- Client-side: apply all filters on loaded chats (fast, <100 chats)
- Server-side: apply only the primary filter (type or world), paginate
- v2: full server-side filter composition when Epic 24 is implemented

## Tasks

### Phase 1: Filter UI Components

- [ ] Create filter chip row in sidebar (below search input)
- [ ] "All" / "Direct" / "Group" chips (toggle group)
- [ ] "World ▼" dropdown (list user's worlds)
- [ ] "More ▼" dropdown (participant count, message count, date, etc.)
- [ ] Active filter display as removable chips
- [ ] "Clear all" link when ≥1 filter active

### Phase 2: Filter State Management

- [ ] Create `src/frontend/alpine/chat-filters.ts` — filter state
- [ ] Persist filters in localStorage
- [ ] Restore filters on sidebar open
- [ ] Wire filter changes to chat list refresh

### Phase 3: Client-Side Filtering

- [ ] Apply type filter on loaded chats (instant)
- [ ] Apply world filter on loaded chats
- [ ] Apply participant/message count filters
- [ ] Apply date filter (last active)
- [ ] Apply pinned filter
- [ ] Apply hasWorld filter
- [ ] Merge with search results

### Phase 4: Server-Side Filter API

- [ ] Add filter parameters to `GET /api/chats`
- [ ] Implement each filter dimension in query
- [ ] Pagination with filtered results
- [ ] Register in router

### Phase 5: Integration & Polish

- [ ] Wire filter state to sidebar rendering
- [ ] Filter count badge (show active filter count)
- [ ] Filter animation (chip add/remove transitions)
- [ ] Responsive: filter chips wrap on narrow screens
- [ ] Mobile: filters in bottom sheet or expandable section

## Files to Create

- `src/frontend/alpine/chat-filters.ts` — filter state management

## Files to Modify

- `src/views/chat-list-panel.html` — filter UI, chip row
- `src/routes/chats.ts` — add filter query parameters
- `src/frontend/alpine/sidebar.ts` — filter integration
- `src/public/css/app.css` — filter chip styles
- `src/components/filter-chips.html` — extend for chat filters (if reusable)

## Acceptance Criteria

- [ ] Filter chips render in sidebar below search
- [ ] Selecting a filter narrows chat list instantly
- [ ] Multiple filters compose (AND logic)
- [ ] Active filters shown as removable chips
- [ ] Filter state persists across page reloads
- [ ] "Clear all" resets all filters
- [ ] Server-side filtering works for type and world
- [ ] Responsive: chips wrap on narrow screens

## Risk

Low — mostly UI work reusing existing filter components. Server-side
filtering is straightforward query building. The Epic 24 gap means
some filters are client-side only in v1.
