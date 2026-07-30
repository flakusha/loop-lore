# Frontend/UX/UI Reconciliation — Backend Systems

**Created:** 2026-07-30
**Purpose:** Map existing backend systems to required frontend/UX/UI work for user-facing functionality

---

## Executive Summary

Many backend/DB items exist in `.plan/` and `docs/` but require additional frontend/UX/UI epics and tasks to be actually usable by end users. This document maps each backend system to its frontend requirements.

---

## Backend → Frontend Mapping

### 1. **World & Locations System** (Backend: `src/world/` — Partial)

| Backend Component        | Frontend Requirement                  | Status         | Priority |
| ------------------------ | ------------------------------------- | -------------- | -------- |
| World CRUD               | World management UI                   | ⬜ Not Started | High     |
| Location CRUD            | Location explorer UI                  | ⬜ Not Started | High     |
| Travel system            | Travel UI (route selection, progress) | ⬜ Not Started | High     |
| Time tracking            | Time display widget                   | ⬜ Not Started | Medium   |
| Anomaly system           | Anomaly interaction UI                | ⬜ Not Started | Medium   |
| Resource extraction      | Resource gathering UI                 | ⬜ Not Started | Medium   |
| Persistent storage       | Storage management UI                 | ⬜ Not Started | Medium   |
| NPC placement            | NPC location display                  | ⬜ Not Started | Medium   |
| Random encounters        | Encounter UI                          | ⬜ Not Started | Medium   |
| Monster compendium       | Monster bestiary UI                   | ⬜ Not Started | Low      |
| Diplomacy system         | Faction relations UI                  | ⬜ Not Started | Low      |
| NPC memory/relationships | NPC relationship viewer               | ⬜ Not Started | Low      |
| Karma/standing           | Reputation display widget             | ⬜ Not Started | Low      |
| Global cataclysms        | Event notification UI                 | ⬜ Not Started | Low      |

**Missing Frontend Epics:**

- `epic-world-management-ui` — World/location CRUD, explorer, map view
- `epic-travel-ui` — Route selection, progress tracking, fast travel
- `epic-npc-management-ui` — NPC viewer, relationship map, memory browser

---

### 2. **Battle & Action Systems** (Backend: `src/rpg/` — Partial)

| Backend Component    | Frontend Requirement            | Status         | Priority |
| -------------------- | ------------------------------- | -------------- | -------- |
| Battle state         | Battle UI (health bars, status) | ⬜ Not Started | High     |
| Turn-based mechanics | Turn order display              | ⬜ Not Started | High     |
| Battle actions       | Action selection UI             | ⬜ Not Started | High     |
| Battle log           | Battle history viewer           | ⬜ Not Started | Medium   |
| Trading system       | Trading UI                      | ⬜ Not Started | Medium   |
| Inventory management | Inventory grid/list view        | ⬜ Not Started | Medium   |
| Items transfer       | Item transfer UI                | ⬜ Not Started | Medium   |
| Spells & actions     | Spell/action selection UI       | ⬜ Not Started | Medium   |
| Skill rolls          | Dice roll animation UI          | ⬜ Not Started | Low      |

**Missing Frontend Epics:**

- `epic-battle-ui` — Battle state display, action selection, turn order
- `epic-inventory-ui` — Item management, equipment, storage
- `epic-trading-ui` — NPC trading, player-to-player, market

---

### 3. **NSFW Game Mechanics** (Backend: `src/rpg/intimacy/` — Partial)

| Backend Component   | Frontend Requirement   | Status         | Priority |
| ------------------- | ---------------------- | -------------- | -------- |
| Intimacy system     | NSFW interaction UI    | ⬜ Not Started | High     |
| Body systems        | Body state display     | ⬜ Not Started | Medium   |
| Disease/poison      | Health status UI       | ⬜ Not Started | Medium   |
| Housing             | Housing management UI  | ⬜ Not Started | Medium   |
| Weather effects     | Weather display widget | ⬜ Not Started | Low      |
| Social interactions | Social interaction UI  | ⬜ Not Started | Low      |

**Missing Frontend Epics:**

- `epic-nsfw-ui` — Intimacy interactions, body state, health
- `epic-housing-ui` — Housing management, customization

---

### 4. **Character System** (Backend: `src/rpg/` — Partial)

| Backend Component | Frontend Requirement    | Status         | Priority |
| ----------------- | ----------------------- | -------------- | -------- |
| Character CRUD    | Character editor UI     | ✅ Exists      | —        |
| Stats/abilities   | Stats display widget    | ⬜ Not Started | Medium   |
| Skills            | Skill tree/selection UI | ⬜ Not Started | Medium   |
| Achievements      | Achievement display UI  | ⬜ Not Started | Low      |
| Multi-personality | Personality switcher UI | ⬜ Not Started | Low      |
| Mood/happiness    | Mood display widget     | ⬜ Not Started | Low      |

**Missing Frontend Epics:**

- `epic-character-ui-enhancements` — Stats, skills, achievements display

---

### 5. **Memory System** (Backend: `src/db/` — Complete)

| Backend Component | Frontend Requirement | Status         | Priority |
| ----------------- | -------------------- | -------------- | -------- |
| Memory CRUD       | Memory panel UI      | ✅ Exists      | —        |
| Memory selection  | Memory selection UI  | ✅ Done        | —        |
| Memory browsing   | Memory browser UI    | ⬜ Not Started | Medium   |

**Missing Frontend Tasks:**

- `TASK-memory-browser-ui` — Advanced memory browsing, filtering, search

---

### 6. **RAG & Document Processing** (Backend: Not Started)

| Backend Component | Frontend Requirement | Status         | Priority |
| ----------------- | -------------------- | -------------- | -------- |
| Document upload   | Document upload UI   | ⬜ Not Started | High     |
| Search interface  | Search UI            | ⬜ Not Started | High     |
| Source citations  | Citation display UI  | ⬜ Not Started | Medium   |

**Missing Frontend Epics:**

- `epic-rag-ui` — Document upload, search, citation display

---

### 7. **Plugin System** (Backend: `src/plugins/` — Skeleton)

| Backend Component    | Frontend Requirement | Status         | Priority |
| -------------------- | -------------------- | -------------- | -------- |
| Plugin management    | Plugin management UI | ⬜ Not Started | Medium   |
| Plugin configuration | Plugin settings UI   | ⬜ Not Started | Medium   |

**Missing Frontend Epics:**

- `epic-plugin-management-ui` — Plugin install, configure, enable/disable

---

### 8. **Story Mode** (Backend: `src/story/` — Partial)

| Backend Component | Frontend Requirement | Status         | Priority |
| ----------------- | -------------------- | -------------- | -------- |
| GM panel          | GM control panel     | ⬜ Not Started | High     |
| Quest log         | Quest log UI         | ⬜ Not Started | High     |
| World state       | World state display  | ⬜ Not Started | Medium   |
| Turn order        | Turn order display   | ⬜ Not Started | Medium   |

**Missing Frontend Tasks:**

- `TASK-story-mode-ui` — GM panel, quest log, world state display

---

### 9. **Admin & Settings** (Backend: Complete)

| Backend Component | Frontend Requirement | Status    | Priority |
| ----------------- | -------------------- | --------- | -------- |
| Admin dashboard   | Admin UI             | ✅ Exists | —        |
| User management   | User management UI   | ✅ Exists | —        |
| Settings          | Settings modal       | ✅ Exists | —        |

**Status:** Complete

---

### 10. **Import/Export** (Backend: Partial)

| Backend Component | Frontend Requirement  | Status         | Priority |
| ----------------- | --------------------- | -------------- | -------- |
| Character import  | Import dialog         | ✅ Exists      | —        |
| Chat export       | Export dialog         | ⬜ Not Started | Medium   |
| Bulk operations   | Bulk import/export UI | ⬜ Not Started | Low      |

**Missing Frontend Tasks:**

- `TASK-export-ui` — Chat export dialog, bulk operations

---

## Priority Matrix

### P0 — Critical (Blocking User Adoption)

| Task                  | Backend Dependency   | Effort | Impact                            |
| --------------------- | -------------------- | ------ | --------------------------------- |
| Accessibility & Input | None (cross-cutting) | High   | Critical — required for all users |
| Battle UI             | Battle system        | High   | High — core gameplay              |
| World Management UI   | World system         | Medium | High — core gameplay              |
| NSFW Interaction UI   | NSFW mechanics       | Medium | High — core feature               |

### P1 — High (Post-P0)

| Task          | Backend Dependency | Effort | Impact |
| ------------- | ------------------ | ------ | ------ |
| Travel UI     | Travel system      | Medium | Medium |
| Inventory UI  | Inventory system   | Medium | Medium |
| Trading UI    | Trading system     | Medium | Medium |
| Story Mode UI | Story system       | Medium | Medium |

### P2 — Medium (Post-P1)

| Task                 | Backend Dependency | Effort | Impact |
| -------------------- | ------------------ | ------ | ------ |
| NPC Management UI    | NPC system         | Medium | Low    |
| Memory Browser UI    | Memory system      | Low    | Low    |
| Plugin Management UI | Plugin system      | Low    | Low    |
| RAG UI               | RAG system         | Medium | Low    |

### P3 — Low (Post-P2)

| Task                  | Backend Dependency | Effort | Impact |
| --------------------- | ------------------ | ------ | ------ |
| Housing UI            | Housing system     | Medium | Low    |
| Monster Compendium UI | Monster system     | Low    | Low    |
| Achievement UI        | Achievement system | Low    | Low    |

---

## Recommended Frontend Epic Structure

### Epic 1: Accessibility & Input Systems (P0 — Critical)

- Keyboard navigation system
- Screen reader support (ARIA)
- Mobile touch gestures
- Responsive design
- Focus management
- Keyboard shortcuts

### Epic 2: Battle & Combat UI

- Battle state display (health bars, status effects)
- Turn order visualization
- Action selection interface
- Battle log viewer
- Skill check UI (dice roll animation)

### Epic 3: World & Location UI

- World management dashboard
- Location explorer (list/grid/map views)
- Travel interface (route selection, progress)
- Time/weather display widget
- Resource extraction UI

### Epic 4: Inventory & Trading UI

- Inventory grid/list view
- Item management (sort, filter, compare)
- Equipment loadout interface
- NPC trading interface
- Player-to-player trading

### Epic 5: NSFW Interaction UI

- Intimacy interaction interface
- Body state display
- Health/disease status UI
- Housing management

### Epic 6: Story Mode UI

- GM control panel
- Quest log interface
- World state display
- Turn order visualization

### Epic 7: NPC & Social UI

- NPC viewer with relationships
- Faction relations display
- Karma/standing widget
- Social interaction interface

### Epic 8: RAG & Document UI

- Document upload interface
- Search interface with citations
- Source management

### Epic 9: Plugin Management UI

- Plugin marketplace/browse
- Plugin configuration interface
- Plugin enable/disable toggles

---

## Integration Points

### Shared Components Needed

| Component                | Used By                  | Priority |
| ------------------------ | ------------------------ | -------- |
| Focus manager            | All pages                | High     |
| Keyboard shortcut system | All pages                | High     |
| Touch gesture system     | All pages                | High     |
| Screen reader utils      | All pages                | High     |
| Health bar widget        | Battle, NSFW, NPC        | High     |
| Status effect badges     | Battle, NSFW, Disease    | High     |
| Dice roll animation      | Battle, Skill checks     | Medium   |
| Inventory grid           | Battle, Trading, Storage | Medium   |
| Relationship graph       | NPC, Faction, Diplomacy  | Low      |
| Map/Location view        | World, Travel, NPC       | Medium   |
| Quest log widget         | Story, World, RPG        | Medium   |
| Time/weather widget      | World, Travel, NSFW      | Low      |

### Page Templates Needed

| Template            | Purpose                      | Priority |
| ------------------- | ---------------------------- | -------- |
| Battle page         | Full-screen battle interface | High     |
| World explorer page | Location browsing, travel    | High     |
| Inventory page      | Item management              | Medium   |
| Trading page        | NPC/player trading           | Medium   |
| Story mode page     | GM panel, quest log          | Medium   |

### Accessibility Requirements by Page

| Page      | Keyboard Features          | Screen Reader         | Mobile Features     |
| --------- | -------------------------- | --------------------- | ------------------- |
| Chat      | Message nav, quick actions | Live regions          | Bottom input, swipe |
| Battle    | Action shortcuts, turn nav | State announcements   | Large touch targets |
| Inventory | Grid nav, bulk actions     | Item descriptions     | Card view, swipe    |
| World     | Map nav, location select   | Location descriptions | Pinch zoom, touch   |
| Settings  | Form nav, save shortcuts   | Label associations    | Stacked fields      |

### Mobile Breakpoints by Page

| Breakpoint | Chat                     | Battle                 | Inventory      | World         |
| ---------- | ------------------------ | ---------------------- | -------------- | ------------- |
| <480px     | Full-width, bottom input | Large buttons, stacked | Card view      | List view     |
| 480-768px  | Sidebar overlay          | Side panel             | Grid view      | Grid view     |
| 768-1200px | Push sidebar             | Full layout            | Grid view      | Map view      |
| >1200px    | Full layout              | Full layout            | Grid + details | Map + details |

---

## Next Steps

1. **Create frontend epic files** for each missing epic
2. **Break down into tasks** with acceptance criteria
3. **Estimate effort** and prioritize
4. **Map dependencies** between frontend and backend work
5. **Create UI component specs** for shared widgets
6. **Implement accessibility system** (focus, keyboard, screen reader)
7. **Implement mobile support** (touch, responsive, gestures)
8. **Test across devices** (desktop, tablet, mobile)
9. **Test with screen readers** (NVDA, VoiceOver, TalkBack)
10. **Keyboard-only testing** for all workflows

---

## Files Created

- `.plan/epics/epic-accessibility-input.md` ✅ — Accessibility, keyboard, mobile
- `.plan/epics/epic-battle-ui.md` ✅ — Battle state, actions, turn order
- `.plan/epics/epic-world-management-ui.md` ✅ — World/location CRUD, travel
- `.plan/epics/epic-inventory-ui.md` ✅ — Inventory grid, trading, equipment
- `.plan/epics/epic-nsfw-ui.md` ✅ — Intimacy, body state, housing
- `.plan/epics/epic-story-mode-ui.md` ✅ — GM panel, quest log, world state
- `.plan/epics/epic-npc-management-ui.md` ✅ — NPC viewer, relationships, factions
- `.plan/epics/epic-rag-ui.md` ✅ — Document upload, search, citations
- `.plan/epics/epic-plugin-management-ui.md` ✅ — Plugin marketplace, config

## Tasks Created

- `.plan/tasks/TASK-keyboard-navigation.md` ✅
- `.plan/tasks/TASK-mobile-touch-gestures.md` ✅
- `.plan/tasks/TASK-screen-reader-support.md` ✅
- `.plan/tasks/TASK-responsive-design.md` ✅
- `.plan/tasks/TASK-battle-state-display.md` ✅
- `.plan/tasks/TASK-battle-action-selector.md` ✅
- `.plan/tasks/TASK-world-dashboard.md` ✅

## Testing Strategy

### Accessibility Testing

| Test Type                | Tool                      | Frequency     |
| ------------------------ | ------------------------- | ------------- |
| Automated a11y audit     | axe-core, Lighthouse      | Every PR      |
| Keyboard-only testing    | Manual                    | Every feature |
| Screen reader testing    | NVDA, VoiceOver, TalkBack | Every release |
| Color contrast check     | Contrast analyzer         | Every PR      |
| Focus order verification | Manual                    | Every feature |

### Mobile Testing

| Test Type                     | Device/Tool         | Frequency     |
| ----------------------------- | ------------------- | ------------- |
| Touch target sizing           | Manual measurement  | Every PR      |
| Swipe gesture testing         | iOS/Android devices | Every feature |
| Responsive breakpoint testing | Browser devtools    | Every PR      |
| Performance on mobile         | Lighthouse mobile   | Every release |
| Offline support               | Service worker      | Every release |

### Cross-Browser Testing

| Browser        | Priority | Test Type |
| -------------- | -------- | --------- |
| Chrome         | High     | Full      |
| Firefox        | High     | Full      |
| Safari         | High     | Full      |
| Edge           | Medium   | Core      |
| Mobile Chrome  | High     | Full      |
| Mobile Safari  | High     | Full      |
| Mobile Firefox | Medium   | Core      |
