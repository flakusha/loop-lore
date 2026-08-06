# TASK: World Item Frontend (Item Creation & Item Settings)

**Status:** ⬜ Not Started
**Priority:** P1 — High
**Effort:** Medium
**Epic:** epic-inventory-ui
**Tags:** items, frontend, world, creation, settings

## Summary

Build the frontend UI for **world-level item definitions** — item creation and item settings menus. The backend API exists in `src/routes/story-items.ts` (ItemsService, `src/story/items.ts`) but **no frontend view, partial, or Alpine component consumes it** — the menus are backend-only. Verify with `glob 'src/{views,partials,components,frontend}/**/*item*'` → no matches.

## Backend API (exists, verified)

| Route                                        | Method         | Purpose                              |
| -------------------------------------------- | -------------- | ------------------------------------ |
| `/api/worlds/:worldId/items`                 | GET            | List item definitions (paginated)    |
| `/api/worlds/:worldId/items`                 | POST           | Create item definition               |
| `/api/worlds/:worldId/items/:id`             | GET            | Get definition                       |
| `/api/worlds/:worldId/items/:id`             | PUT            | Update definition (settings)         |
| `/api/worlds/:worldId/items/:id`             | DELETE         | Delete definition                    |
| `/api/worlds/:worldId/items/:id/instances`   | GET            | List placed instances                |
| `/api/worlds/:worldId/item-instances`        | POST           | Place item in location / give to NPC |
| `/api/worlds/:worldId/item-instances/:instanceId/transfer` | POST | Move items                 |
| `/api/worlds/:worldId/item-instances/:instanceId`         | DELETE | Destroy instance           |

Item definition fields (from `StoryItemResponse` / `ItemCategory` / `ItemRarity` in `src/db/enums`): name, description, `category` (ItemCategory), `rarity` (ItemRarity), `properties` JSON (stats/effects), `lore`/tags as supported.

## Files to Create

- `src/views/world-items.html` — world items page/view (or a tab in `world-edit.html`)
- `src/components/world/items-panel.html` — list + create/edit form partial
- `src/partials/worlds/item-create-modal.html` — item creation modal (mirrors `create-modal.html` pattern)
- `src/frontend/alpine/world-items.ts` — `worldItems()` Alpine component (load/list/create/update/delete, hits `/api/worlds/:worldId/items`)
- Wire into `world-edit.html` tabs (general / locations / **items**)

## Acceptance Criteria

- [ ] Item list per world (paginated) with category/rarity badges
- [ ] Item creation modal (name, description, category, rarity, properties)
- [ ] Item settings/edit form (PUT update)
- [ ] Item delete with confirmation
- [ ] Item-instance placement (place in location / give to NPC) if within scope
- [ ] Loading and error states; ownership-gated (owner/admin only)
- [ ] `bun test src/` green; `bun run check` no new failures

## Related

- `epic-inventory-ui.md` / `epic-items.md` — inventory/items epics
- `TASK-actor-notes-items-lore-frontend.md` — actor-level (per-character) item UI (separate, also open)
- `src/routes/story-items.ts` — backend contract
