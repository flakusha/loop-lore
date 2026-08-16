# TASK: Chat Flow — Section Navigation & Story Spanning

**Status:** 🟡 In Progress — Phase 1 shipped (2026-08-16, commit c5270239): inline dividers, `jumpToSection`, grouping breaks, sections auto-load on chat select. Phases 2-6 being implemented in this ticket's Tasks section (story map counts/highlight, sticky location header, section transfer, scrollspy flow, group-chat indicators).
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
- Note: message count + timestamp per divider deferred to Phase 3 (sticky header shows count)

### Phase 2: Story Map Panel — 🟡 IN PROGRESS
- [x] Sections listed with location names (existing `sections-panel.html`)
- [ ] Show message count per section (compute FE-side from `groupedMessages`)
- [x] Click to jump to section
- [x] Collapsible panel (right-panel + `$store.ui.showSectionsPanel`)
- [ ] Highlight current section (scrollspy → `_currentSectionId`, distinct from user `_activeSectionId`)
- [ ] Visited vs future distinction — no future sections in data model (additive); show visited/current only
- [ ] Mobile: panel is overlay already (panel-backdrop)

### Phase 3: Location Header — 🟡 IN PROGRESS
- [ ] Sticky bar atop message list: current section name + icon + message count
- [ ] Quick actions: open story map, transfer
- [ ] Fade animation on section change (scrollspy-driven)
- [ ] Responsive: hide on narrow screens (media query)

### Phase 4: Transfer — 🟡 IN PROGRESS (partial exists)
- [x] Location selector + Set/Transfer (existing `location-panel.html` + `transferChatLocation`)
- [ ] `transferToSection(sectionId)` — set active section + jump + sync chat location to section's location
- [ ] Narrative text / transition type — deferred (background panel covers visual switch)

### Phase 5: Flow Integration — 🟡 IN PROGRESS
- [x] Dividers wired to scroll (rendered in stream)
- [ ] Scrollspy: track `_currentSectionId` from scroll position (throttled)
- [ ] Sticky header bound to `_currentSectionId`
- [ ] Background sync on section change (section.location_id → matching background)
- [ ] `loadSections()` on chat select (done)

### Phase 6: Group Chat Support — 🟡 IN PROGRESS
- [ ] Per-character section map from `actor_name` + section_id of messages
- [ ] Split indicator: actors in different sections (badge)
- [ ] Reunite indicator: all in same section
- [ ] Transfer all vs individuals — deferred (per-message assign covers individual; bulk move out of scope)

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
