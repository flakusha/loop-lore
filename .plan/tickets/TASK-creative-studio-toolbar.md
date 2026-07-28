# Task: Creative Toolbar in Chat Input

**Epic:** epic-creative-studio.md (MVP Tier 1)
**Status:** ⬜ Not Started
**Effort:** Low
**Depends On:** TASK-creative-studio-note-modal, TASK-creative-studio-world-modal, TASK-creative-studio-item-modal

## Goal

Add creative tools toolbar to chat input area for quick access.

## Acceptance Criteria

- [ ] Toolbar below chat input with icon buttons
- [ ] "New Note" button → opens note creation modal
- [ ] "Search Context" button → opens search page/modal
- [ ] "Add Item" button → opens item creation modal
- [ ] "World Info" button → opens world selector
- [ ] Buttons disabled when no actor/chat selected
- [ ] Keyboard shortcuts (Ctrl+N = new note, Ctrl+F = search)

## Implementation

- Alpine.js component
- htmx for modal loading
- CSS for toolbar layout

## Files to Create/Modify

- `src/frontend/creative-studio/toolbar.ts` (new)
