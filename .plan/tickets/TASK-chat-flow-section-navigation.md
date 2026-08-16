# TASK: Chat Flow — Section Navigation & Story Spanning

**Status:** 🟢 Complete — Phases 1-6 shipped (2026-08-16): inline dividers with message count + start time + jump + grouping breaks (c5270239, d726e108); story map with counts/current highlight/actor presence/split-party badge; sticky location header w/ scrollspy + map/transfer actions; transfer with transition-type picker (walk/teleport/narrative) + optional narrative insertion + fade fx + location/background sync (d726e108); bulk move-all assign (d726e108). Split into `chat-sections.ts` (manage) + `chat-sections-nav.ts` (navigation) for size gate.
**Priority:** Medium
**Effort:** Med
**Related:** TASK-chat-sectioning-multi-location, TASK-chat-backgrounds-location-sync

## Summary

UI/UX for navigating chat sections like a story — location chapters with visual transitions, story map, and seamless flow. A single chat becomes a journey through locations.

## Rationale

- Sectioning (TASK-chat-sectioning-multi-location) provides the data model
- This task provides the **user experience** — how users navigate and perceive sections
- Story-like flow makes long RPG conversations feel cohesive, not fragmented
- Visual location changes reinforce immersion

## User Experience Goals

1. **Seamless flow** — Sections feel like chapters in a book, not separate chats
2. **Visual navigation** — Users can see where they've been and where they're going
3. **Context preservation** — History always accessible, no data loss
4. **Group awareness** — In group chat, see which characters are in which location

## Navigation Patterns

### 1. Inline Section Dividers

```
══════════════════════════════════════
  📍 The Dark Forest — 12 messages ago
══════════════════════════════════════
[message] [message] [message]
══════════════════════════════════════
  📍 Ancient Tavern — Current
══════════════════════════════════════
[message] [message]
```

- Always visible in scroll
- Click to jump to section start
- Background changes at divider
- Timestamp + message count per section

### 2. Story Map (Side Panel)

```
┌─────────────────────────────┐
│  Story Map                  │
│  ─────────────────────────  │
│  ● The Dark Forest (12 msgs)│ ← visited
│  │                          │
│  ├─ Ancient Tavern (5 msgs) │ ← current
│  │                          │
│  ○ Castle Gates (0 msgs)    │ ← future (if known)
│  │                          │
│  ○ Throne Room (?)          │ ← unknown
└─────────────────────────────┘
```

- Visual timeline of locations
- Click to jump to any section
- Shows message count per section
- Future locations shown if discovered
- Collapsible side panel

### 3. Location Header (Sticky)

```
┌──────────────────────────────────────┐
│ 📍 Ancient Tavern    [Map] [Transfer]│ ← sticky header
├──────────────────────────────────────┤
│ [message] [message]                  │
│ [message]                            │
└──────────────────────────────────────┘
```

- Always shows current location
- Quick actions: view map, transfer
- Changes on section transition
- Smooth fade/wipe animation

### 4. Transfer Dialog

```
┌──────────────────────────────────────┐
│  Transfer to New Location            │
│  ─────────────────────────────────── │
│  Current: Ancient Tavern             │
│                                      │
│  Destination:                        │
│  [Castle Gates ▼]                    │
│                                      │
│  Transition:                         │
│  [Walk 🚶] [Teleport ⚡] [Narrative 📖]│
│                                      │
│  [Cancel]              [Transfer →]  │
└──────────────────────────────────────┘
```

- Select destination from known locations
- Choose transition type (affects background/animation)
- Optional: add narrative text for transition

## Tasks

### Phase 1: Section Divider Component — ✅ SHIPPED (commit c5270239)

- [x] Inline divider in message stream (`message-list.html` + `sectionDividerFor`)
- [x] Location name label via `sectionLabel`
- [x] Click to scroll to section start (`jumpToSection`)
- [x] Smooth scroll animation
- [x] Background change at divider point (CSS pill divider)
- [x] Divider meta: message count + section start time (`sectionDividerMeta` + `formatSectionTime`)

### Phase 2: Story Map Panel — 🟡 IN PROGRESS

- [x] Sections listed with location names (existing `sections-panel.html`)
- [x] Show message count per section (compute FE-side from `sectionMessageCounts`)
- [x] Click to jump to section
- [x] Collapsible panel (right-panel + `$store.ui.showSectionsPanel`)
- [x] Highlight current section (scrollspy → `_currentSectionId`, distinct from user `_activeSectionId`)
- [x] Visited vs future distinction — no future sections in data model (additive); show visited/current only
- [x] Mobile: panel is overlay already (panel-backdrop)

### Phase 3: Location Header — 🟡 IN PROGRESS

- [x] Sticky bar atop message list: current section name + icon + message count (`location-header` in message-list.html)
- [x] Quick actions: open story map, transfer (map + transfer buttons in header)
- [x] Fade animation on section change (headerFade keyframes)
- [x] Responsive: hide actor list on narrow screens (media query)

### Phase 4: Transfer — 🟡 IN PROGRESS (partial exists)

- [x] Location selector + Set/Transfer (existing `location-panel.html` + `transferChatLocation`)
- [x] `transferToSection(sectionId)` — set active section + jump + sync chat location to section's location
- [x] Transition type picker (walk/teleport/narrative) + optional narrative text — narrative inserted as system narration bound to the section (POST /chats/:id/sections/:sectionId/narrative); visual fade fx on transfer

### Phase 5: Flow Integration — 🟡 IN PROGRESS

- [x] Dividers wired to scroll (rendered in stream)
- [x] Scrollspy: track `_currentSectionId` from scroll position (`trackCurrentSection` on message-list scroll)
- [x] Sticky header bound to `_currentSectionId`
- [x] Background sync on section change via `changeChatLocation` (server-side location→background resolution)
- [x] `loadSections()` on chat select

### Phase 6: Group Chat Support — 🟡 IN PROGRESS

- [x] Per-character section map from `actor_name` + section_id of messages (`sectionActors`)
- [x] Split indicator: actors in different sections (party-split badge)
- [x] Reunite indicator: badge hidden when single section (`partySplit` false)
- [x] Bulk move-all (story-map "move all here" → POST /chats/:id/sections/:sectionId/assign-all, optional fromSectionId) + per-message assign covers individuals

## Files to Create

- `src/components/section-divider.html` — inline divider
- `src/components/story-map.html` — side panel
- `src/components/location-header.html` — sticky header
- `src/components/transfer-dialog.html` — transfer UI
- `src/frontend/section-nav.ts` — navigation logic
- `src/frontend/section-nav.test.ts` — tests

## Files to Modify

- `src/views/chat.html` — integrate section UI
- `src/frontend/alpine/chat.ts` — section state
- `src/public/css/app.css` — section styles

## Responsive Design

| Breakpoint          | Layout                                 |
| ------------------- | -------------------------------------- |
| Desktop (>1024px)   | Story map side panel + inline dividers |
| Tablet (768-1024px) | Collapsible map + inline dividers      |
| Mobile (<768px)     | Bottom sheet map + minimal dividers    |

## Performance

| Metric          | Target  | Notes          |
| --------------- | ------- | -------------- |
| Section jump    | < 100ms | Virtual scroll |
| Map render      | < 50ms  | Memoized       |
| Transfer        | < 300ms | Optimistic UI  |
| Background swap | < 500ms | Crossfade      |

## Risk

Med — UI complexity, responsive design, group chat edge cases. Data model from TASK-chat-sectioning-multi-location must be solid first.

## Dependency

**Blocked by:** TASK-chat-sectioning-multi-location (schema design)
**Enables:** TASK-chat-backgrounds-location-sync (section-aware backgrounds)
