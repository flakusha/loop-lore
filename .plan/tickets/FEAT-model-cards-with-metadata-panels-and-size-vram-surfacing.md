<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# FEAT: Model cards with metadata panels and size VRAM surfacing

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** model-info-frontend
**Tags:** frontend, models

**Summary:**

Admin/UI model cards + detail panel over the local model index: preview image, display name, quant, parameter count, context length, base model, category, path, file size, and VRAM estimate; update badge when the lookup cascade reports a newer remote version. Extends src/frontend/alpine/model-manager.ts and admin-models/ (existing model-catalog.ts stays the remote download catalog).

Reference: Stability Matrix ViewModels/CheckpointBrowser/CheckpointBrowserCardViewModel.cs, Views/CheckpointsPage.axaml card layout, Models/Database/LocalModelFile.cs HasUpdate/LastUpdateCheck; llama-swap ui/src/components/model/ModelDetailsTab.svelte + MetadataTooltip.svelte.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
