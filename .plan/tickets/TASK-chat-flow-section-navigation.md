# TASK: Chat Flow — Section Navigation & Story Spanning

**Status:** 🟡 Partial — sectioning backend + manage panel shipped (`routes/chat-sections/` CRUD + `alpine/chat-sections.ts` + chat.html panel); Phase 1 (inline section dividers) shipped 2026-08-16 — `section_id` now flows through `MessageRow` schema + FE `Message` type, `sectionDividerFor` renders a divider when a message starts a new section, `jumpToSection` scrolls to a section's first message, grouping breaks on section change, sections auto-load on chat select; Phases 2-6 (story map, location header, transfer dialog, flow integration, group chat) open
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

### Phase 1: Section Divider Component

- [ ] Create `src/components/section-divider.html` — inline divider
- [ ] Show location name, message count, timestamp
- [ ] Click to scroll to section start
- [ ] Background change at divider point
- [ ] Smooth scroll animation

### Phase 2: Story Map Panel

- [ ] Create `src/components/story-map.html` — side panel
- [ ] List all sections with location names
- [ ] Show message count per section
- [ ] Highlight current section
- [ ] Click to jump to section
- [ ] Collapsible/expandable panel
- [ ] Mobile: bottom sheet or overlay

### Phase 3: Location Header

- [ ] Create `src/components/location-header.html` — sticky header
- [ ] Show current location name + icon
- [ ] Quick action buttons (map, transfer)
- [ ] Fade/wipe animation on location change
- [ ] Responsive: collapses on mobile

### Phase 4: Transfer Dialog

- [ ] Create `src/components/transfer-dialog.html`
- [ ] Location selector (from world locations)
- [ ] Transition type selector
- [ ] Optional narrative text input
- [ ] Confirm/cancel actions
- [ ] Wire to section creation API

### Phase 5: Flow Integration

- [ ] Wire section dividers to chat scroll
- [ ] Wire story map to section state
- [ ] Wire location header to current section
- [ ] Wire transfer dialog to section API
- [ ] Smooth transitions between sections
- [ ] Background sync on section change

### Phase 6: Group Chat Support

- [ ] Show per-character locations in story map
- [ ] Split view when party is separated
- [ ] Reunite indicator when all in same location
- [ ] Transfer: move all or select individuals

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
