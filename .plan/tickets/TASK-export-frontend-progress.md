<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Export Frontend Progress UI

**Status:** ✅ Done (merged to dev 2026-09-15)
**Priority:** P1
**Effort:** Low
**Epic:** epic-frontend-backend-integration
**Tags:** export, frontend, progress, download

## Resolution

Merged to dev in `991f6f050` (`feat(frontend): mount actor panels, export progress; drop orphan`):

- `src/frontend/alpine/export-progress.ts` (+ `.test.ts`) — SSE + polling fallback + download link, driven by `exportProgressFactory`.
- `src/components/export/export-progress-panel.html` — mounted in `src/views/settings.html` under `data-testid="settings-export-progress"`.

## Summary

Add a frontend progress bar and download UI for export jobs. Backend routes exist at `/api/export`, `/api/export/download/:jobId`, `/api/export/status/:jobId` but no frontend UI exists for progress tracking.

## Backend Routes (already exist)

| Route                         | Method | Purpose                   |
| ----------------------------- | ------ | ------------------------- |
| `/api/export`                 | POST   | Start export job          |
| `/api/export/progress`        | GET    | Get export progress       |
| `/api/export/download/:jobId` | GET    | Download completed export |
| `/api/export/status/:jobId`   | GET    | Get job status            |

## Files to Create

- `src/frontend/alpine/export-progress.ts` — Export progress component
- `src/components/export/progress-bar.html` — Progress bar template

## Acceptance Criteria

- [ ] Export progress bar with percentage
- [ ] Download button when export completes
- [ ] Error state display
- [ ] Auto-refresh progress via polling or SSE

## Related

- `epic-import-export-io.md` — Import/export epic
- `TASK-bulk-export-zip.md` — Existing export task
