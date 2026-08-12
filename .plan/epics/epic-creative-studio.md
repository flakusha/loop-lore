# EPIC: Creative Studio

**Status:** 📝 Draft → 🟡 In Progress (MVP scoped)
**Priority:** High (MVP), Medium (full)
**Effort:** High
**Type:** Feature Epic
**Tags:** creative-studio, search, modals, toolbar, unified-search
**Plan.md:** §46
**Issue:** `EPIC-059`
**Spec:** `docs/spec/creative-studio.md`, `docs/spec/gm-shadow-notes.md`

## Summary

Unified creative tools for assistant chat: context menus, modals for locations/worlds/notes/items, creative toolbar, book compilation. Includes intent detection, command sandboxing, and unified search across context items.

## Implementation Gaps (Research 2026-07-28)

### What Exists (Backend Ready, Frontend Missing)

| System           | Backend             | Frontend                    | Gap                      |
| ---------------- | ------------------- | --------------------------- | ------------------------ |
| Assets/Gallery   | ✅ Full API         | ✅ Gallery page             | Cross-linking with notes |
| Memories         | ✅ Full API         | ❌ No UI                    | Unified search           |
| Items            | ✅ CRUD routes      | ❌ No Creative Studio modal | Modal + search           |
| Worlds/Locations | ✅ Full CRUD        | ❌ No Creative Studio modal | Modal + search           |
| Characters       | ✅ Parsing + export | ❌ No creation wizard       | Wizard UI                |
| Notes            | ✅ CRUD routes      | ❌ No dedicated page        | Page + search (spec v4)  |
| Commands         | ✅ 17 built-in      | ✅ Chat input               | Sandboxing + intent      |

### What Needs Building

**Tier 1 — MVP Blockers (do first)**

| Task                                                        | Effort | Depends On      |
| ----------------------------------------------------------- | ------ | --------------- |
| Unified search endpoint (`GET /api/actors/:actorId/search`) | med    | —               |
| Unified search frontend (filter panel, result grid)         | med    | Search endpoint |
| Note detail modal (in Creative Studio)                      | lo     | —               |
| World/Location detail modal                                 | lo     | —               |
| Item detail modal                                           | lo     | —               |
| Creative toolbar (chat input area buttons)                  | lo     | Modals above    |

**Tier 2 — Core Features (after MVP)**

| Task                                                              | Effort | Depends On       |
| ----------------------------------------------------------------- | ------ | ---------------- |
| Intent detection (LLM-backed, fallback to keywords)               | hi     | —                |
| Command sandboxing (isolated execution, timeout, resource limits) | hi     | Intent detection |
| Character creation wizard (stepped form in Creative Studio)       | med    | —                |
| Note ↔ Memory cross-linking (schema + bidirectional refs)         | med    | —                |
| Asset ↔ Note cross-linking (link gallery assets to notes)         | lo     | —                |
| Context menus on chat messages (create note, create image, etc.)  | med    | Modals           |

**Tier 3 — Polish (after Tier 2)**

| Task                                                       | Effort | Depends On |
| ---------------------------------------------------------- | ------ | ---------- |
| Book compilation (stories → exportable format)             | hi     | —          |
| Bulk operations across types (activate, inject, export)    | med    | Search UI  |
| Real-time updates (SSE for note TTL, expiry notifications) | med    | —          |
| Plugin type registration (extensible SearchableItemType)   | lo     | Search UI  |

## MVP Scope (Approved)

**Creative Studio MVP = Tier 1 only:**

1. Unified search endpoint (notes + memories + items + worlds + locations)
2. Unified search frontend page (filter by type, chat, interaction; sort by time)
3. Detail modals for notes, worlds, items (view + edit)
4. Creative toolbar in chat input (buttons to create note, search context)

**Out of MVP:** Intent detection, command sandboxing, character wizard, cross-linking, book compilation.

## Tasks

| Task                                                                                           | Files                                                      | Effort | Source |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ | ------ |
| Unified search API endpoint                                                                    | `src/routes/search.ts`                                     | Med    | new    |
| Unified search frontend page                                                                   | `src/frontend/creative-studio/search.ts`                   | Med    | new    |
| Note detail modal                                                                              | `src/frontend/creative-studio/modals/note-modal.ts`        | Low    | new    |
| World/Location detail modal                                                                    | `src/frontend/creative-studio/modals/world-modal.ts`       | Low    | new    |
| Item detail modal                                                                              | `src/frontend/creative-studio/modals/item-modal.ts`        | Low    | new    |
| Creative toolbar                                                                               | `src/frontend/creative-studio/toolbar.ts`                  | Low    | new    |
| Intent detection                                                                               | `src/assistant/intent-detection.ts`                        | High   | new    |
| Command sandboxing                                                                             | `src/assistant/command-sandbox.ts`                         | High   | new    |
| Character creation wizard                                                                      | `src/frontend/creative-studio/wizards/character-wizard.ts` | Med    | new    |
| Note ↔ Memory cross-linking                                                                    | `src/db/migrations/xxx-note-memory-links.ts`               | Med    | new    |
| Asset ↔ Note cross-linking                                                                     | `src/routes/asset-notes.ts`                                | Low    | new    |
| Context menu system                                                                            | `src/frontend/creative-studio/context-menu.ts`             | Med    | new    |
| Book compilation                                                                               | `src/story/book-compiler.ts`                               | High   | new    |
| Bulk operations                                                                                | `src/routes/search-bulk.ts`                                | Med    | new    |
| Real-time updates (SSE)                                                                        | `src/routes/search-sse.ts`                                 | Med    | new    |
| Plugin type registration                                                                       | `src/search/plugin-types.ts`                               | Low    | new    |
| Workflow step UI + confirmation modal (owned by `epic-assistant-creative-studio-workflows.md`) | `src/frontend/creative-studio/workflow.ts`                 | Med    | new    |

## Dependencies

- Image generation providers (ComfyUI, sd-server) — already implemented
- Story system (epic 42) — for book compilation
- World/Location system (epic 38) — for modals
- Chat lifecycle (epic 36) — for context menu integration
- Memory system — for unified search
- Notes system (gm-shadow-notes) — for unified search
- Items system — for unified search

## Linked Epics

- `epic-gm-shadow-notes.md` — notes spec (TTL, shadow, injection)
- `epic-memory-knowledge-systems.md` — memory system
- `epic-items.md` — item system
- `epic-locations.md` — location system
- `epic-worlds-extension.md` — world system
- `epic-character-spec.md` — character system
- `epic-frontend-gallery.md` — gallery frontend
- `epic-plugin-system.md` — plugin extensibility
- `epic-assistant-generation-extensions.md` — intent detection
