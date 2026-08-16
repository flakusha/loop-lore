<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Task: Note Detail Modal

**Epic:** epic-creative-studio.md (MVP Tier 1)
**Status:** ⬜ Not Started
**Effort:** Low
**Depends On:** —

## Goal

Modal for viewing and editing notes in Creative Studio.

## Acceptance Criteria

- [ ] Modal opens on click from search results or chat
- [ ] Shows full note content (no truncation)
- [ ] Edit form: title, content, category, visibility, TTL, scope, pinned
- [ ] Status indicator (active/inactive/expired)
- [ ] TTL badge with remaining/total
- [ ] Save/Patch notes via API
- [ ] Delete with confirmation
- [ ] Reactivate button for expired notes
- [ ] Dev mode: show raw token counts, injection order

## Implementation

- Alpine.js modal component
- htmx for form submission
- Integrate with `GET/PATCH/DELETE /api/actors/:actorId/notes/:noteId`

## Files to Create/Modify

- `src/frontend/creative-studio/modals/note-modal.ts` (new)
