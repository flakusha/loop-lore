<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-world-editor-structured-ui

**Status**: open
**Priority**: medium
**Labels**: frontend, world-editor, ux, alpine, htmx
**Assignee**:
**Epic**: epic-world-management-ui
**Related**: `src/routes/views/worlds.ts`, `src/frontend/alpine/world-edit.ts`, `docs/spec/worlds.md`

## Description

World management has route endpoints (`src/routes/worlds/`, `src/routes/admin/worlds.ts`) and a basic Alpine world edit module (`src/frontend/alpine/world-edit.ts`) — but no dedicated world editor UI with structured fields matching the world spec.

**Current state**:
- `world-edit.ts` handles world settings (name, description, visibility, avatar)
- World routes handle CRUD, channels, invites, locations, lore entries
- No unified editor form for all world properties

**Spec-defined world properties missing from UI**:
- `WorldStyleRules` (speech_style, allowed/forbidden personality traits, expression modifiers)
- `WorldValidationRules` (allowed_content_ratings, max_description_length, required_fields, forbidden_tags)
- NSFW location types (from `src/routes/nsfw/location.ts`)
- World diplomacy/karma settings
- World travel time configuration
- World encounters configuration
- World NPC roster management
- World channels/invites management

### Acceptance Criteria

- [ ] World edit form with tabbed navigation: Basic | Style | Validation | Locations | NPCs | Settings
- [ ] **Basic tab**: name, description, visibility, avatar, world type
- [ ] **Style tab**: speech_style selector, allowed/forbidden personality traits (multi-tag input), expression modifiers JSON editor
- [ ] **Validation tab**: allowed_content_ratings (multi-select), max_description_length, required_fields (multi-tag), forbidden_tags (multi-tag)
- [ ] **Locations tab**: location list with CRUD, drag-to-reorder, parent-child hierarchy
- [ ] **NPCs tab**: linked characters list, add/remove, NPC role assignment
- [ ] **Settings tab**: channels, invites, diplomacy, karma, travel time, encounters
- [ ] htmx partials for each tab with Alpine hydration
- [ ] World create flow: minimal form → save → redirect to full editor
- [ ] Unit test: tab navigation, field rendering, style rule validation

### Notes

- `src/frontend/alpine/world-edit.ts` is the starting point — extend with tab switching
- World routes are well-structured under `src/routes/worlds/` — API already exists
- `WorldStyleRules` and `WorldValidationRules` are TypeScript interfaces in the spec — may need DB columns or JSON storage
- Location editor is a sub-component — see TASK-location-editor-structured-ui
