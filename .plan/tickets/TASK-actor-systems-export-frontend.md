<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Actor Systems Export/Import Frontend

**Status:** ✅ Done (merged to dev 2026-09-15)
**Priority:** P2
**Effort:** Medium
**Epic:** epic-frontend-backend-integration
**Tags:** systems, export, import, frontend, actor

## Resolution

Merged to dev in `991f6f050` (`feat(frontend): mount actor panels, export progress; drop orphan`):

- `src/frontend/alpine/actor-systems.ts` — export trigger + section toggles + import (payload + URL) forms.
- `src/components/character/systems-panel.html` — mounted inline in `src/routes/views/character-edit-form.ts`.

## Summary

Create frontend UI for exporting/importing actor systems data. Backend routes exist at `/api/actors/:actorId/systems/*` but no frontend UI exists.

## Backend Routes (already exist)

| Route                                 | Method | Purpose             |
| ------------------------------------- | ------ | ------------------- |
| `/api/actors/:actorId/systems/export` | GET    | Export systems data |

## Files to Create

- `src/frontend/alpine/actor-systems.ts` — Systems export/import component
- `src/components/character/systems-panel.html` — Systems panel template

## Acceptance Criteria

- [ ] Export systems data button
- [ ] Import systems data dialog
- [ ] Export format selection (JSON, etc.)
- [ ] Loading and error states

## Related

- `epic-import-export-io.md` — Import/export epic
