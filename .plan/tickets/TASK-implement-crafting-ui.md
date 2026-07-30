# TASK: Implement crafting UI

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-crafting-professions

## Summary

No crafting UI exists. Need crafting station interaction, recipe book, profession progress display. Frontend pages under `src/frontend/`.

## Scope

### UI Components

| Component              | Purpose                                       | Location                       |
| ---------------------- | --------------------------------------------- | ------------------------------ |
| **CraftingStation**    | Interact with station, start crafting         | `src/frontend/pages/crafting/` |
| **RecipeBook**         | Browse/discover recipes, filter by discipline | `src/frontend/pages/crafting/` |
| **ProfessionProgress** | Show levels, XP, titles, bonuses              | `src/frontend/pages/crafting/` |
| **CraftingQueue**      | Active crafting tasks, time remaining         | `src/frontend/pages/crafting/` |
| **QualityIndicator**   | Show item quality tier and bonuses            | Component                      |

### UI Interactions

- Click station in world → open crafting UI
- Browse recipes by discipline → filter/sort
- Start crafting → show progress, time remaining
- Crafting complete → show result, quality, XP gain
- View profession progress → levels, titles, unlocks

## Linked Epics

- `epic-crafting-professions.md`

## Acceptance Criteria

- [ ] Crafting station interaction UI (click station → open crafting)
- [ ] Recipe book with discipline filtering and sorting
- [ ] Profession progress display (levels, XP, titles, bonuses)
- [ ] Crafting queue with active tasks and time remaining
- [ ] Quality indicator showing item quality tier
- [ ] Alpine.js components follow existing patterns
- [ ] Responsive design works on mobile
- [ ] Integration with CraftingProcessService for crafting attempts
- [ ] Unit tests for UI state management
- [ ] E2E tests for full crafting workflow

## Notes

- Follow existing Alpine.js patterns in `src/frontend/`
- Reference `docs/frontend/` for UI conventions
- Use htmx for server-rendered components where appropriate
