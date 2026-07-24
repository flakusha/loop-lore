# EPIC: Creative Studio

**Status:** 📝 Draft
**Priority:** Medium
**Plan.md:** §46
**Issue:** `EPIC-046`

## Summary

Enrich assistant chat with creative studio functionalities — context menus for image creation, modals for locations, worlds, notes, stories, and "book" compilation by access to known stories. Includes character template seeding for creative personas.

## Tasks

| Task                                       | Files                                         | Effort | Source   |
| ------------------------------------------ | --------------------------------------------- | ------ | -------- |
| Character template seeding                 | `src/config/character-loader.ts`              | Med    | new      |
| Context menu system for chat messages      | `src/frontend/components/context-menu.ts`     | Med    | new      |
| Image creation context menu                | `src/frontend/components/image-menu.ts`       | Med    | new      |
| Location modal                             | `src/frontend/modals/location-modal.ts`       | Med    | new      |
| World modal                                | `src/frontend/modals/world-modal.ts`          | Med    | new      |
| Notes modal                                | `src/frontend/modals/notes-modal.ts`          | Low    | new      |
| Stories modal                              | `src/frontend/modals/stories-modal.ts`        | Med    | new      |
| Book compilation from known stories        | `src/story/book-compiler.ts`                  | High   | new      |
| Story access API for book compilation      | `src/routes/stories.ts`                       | Med    | new      |
| Creative toolbar in chat                   | `src/frontend/components/creative-toolbar.ts` | Med    | new      |
| Integration with existing image generation | `src/image-edit/`, `src/generation/`          | Med    | existing |

## Ideas Merged

- New concept: Creative Studio — unified creative tools in chat UI
- Character templates from configs/characters/ directory with hard IDs and access control

## Dependencies

- Image generation providers (ComfyUI, sd-server) — already implemented
- Story system (epic 42) — for book compilation
- World/Location system (epic 38) — for modals
- Chat lifecycle (epic 36) — for context menu integration

## Linked Tasks

- TASK-character-template-seeding.md — character file loading and seeding
- TASK-character-licensing.md — licensing metadata (future)
- TASK-character-rpg-stats.md — RPG stats state machines (future)
- TASK-character-relationships.md — relationship graph system (future)
- TASK-item-system-extensions.md — usable/collectable/consumable items (future)
- TASK-creative-studio.md
