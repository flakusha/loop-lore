<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-001: Asset Preview Modal & Avatar Centering UI

**Status:** done
**Priority:** medium
**Effort:** Medium
**Summary:** Modal-based asset preview with a centered avatar viewport.
**Context:** Frontend (Vue/Alpine) extension to the asset gallery; centered modal portal with keyboard dismiss and focus restore.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: done
**Priority:** medium
**Effort:** Medium
**Labels**: frontend, gallery, avatar, ui
**Assignee**:
**Epic**: epic-frontend-components
**Related**:

## Summary

Ship a modal-based asset preview with a centered avatar viewport so users can inspect characters, scenes, and gallery items without leaving the current view.

## Context

Scope is purely frontend (Vue/Alpine views and components). No backend schema changes. Sits inside the frontend-components epic alongside gallery and avatar pipelines; depends on the asset thumbnailing work (epic-asset-platform-capabilities) for preview sizing.

IN: modal shell, avatar centering math, gallery trigger wiring, keyboard dismiss.
OUT: backend asset metadata, thumbnail generation, role/permission gating.

## Acceptance Criteria

- [x] Modal opens on gallery tile click and overlays the current view without layout shift
- [x] Avatar is centered both horizontally and vertically across viewport sizes from 360px to 1920px wide
- [x] ESC and backdrop click dismiss; focus is restored to the triggering element on close
- [x] Preview shows metadata strip (name, tags, source) sourced from existing asset payload
- [x] No regression in existing gallery keyboard navigation

## Related Files

- src/components/AssetPreviewModal.vue (to be created)
- src/components/AvatarCenterer.vue (to be created)
- src/views/GalleryView.vue
- src/frontend/gallery/

## Notes

- Sibling of BUG-avatar-select-* tickets — leverage same fallback chain
- See epic-asset-platform-capabilities for thumbnail sizing constraints

Git issue: `732d54b`
