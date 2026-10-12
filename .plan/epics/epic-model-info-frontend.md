<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Model Info Frontend (Cards, Tags, Filters)

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** frontend, models, cards, tags, search, alpine, admin

## Summary

Surface locally discovered models (from `epic-local-model-file-discovery.md`) and their parsed metadata (from `epic-model-metadata-read.md`) in the admin/UI: model cards with metadata panels (display name, quant, parameter count, context length, base model), tags/search/filter over local models, size/VRAM surfacing, and update badges when a known remote version is newer. Extends the existing frontend model surface (`src/frontend/alpine/model-manager.ts`, `admin-models/`, `model-catalog.ts` — which covers the remote download catalog, not local files).

Reference implementations: Stability Matrix `ViewModels/CheckpointBrowser/CheckpointBrowserCardViewModel.cs`, `ViewModels/CheckpointBrowserViewModel.cs` (search + base-model filters), `Views/CheckpointsPage.axaml` card layout, `Models/Database/LocalModelFile.cs` (HasUpdate/LastUpdateCheck badges); llama-swap `ui/src/components/model/{ModelDetailsTab,MetadataTooltip}.svelte` for detail panels.

## Scope

- Model card grid + detail panel: preview image, display name, quant, params, context length, base model, category, path, size.
- Tags and text search over the local index; filter by category / base model / quant.
- Size and (estimated) VRAM surfacing on cards and detail view.
- Update badge when the lookup cascade finds a newer remote version.

Out of scope: header parsing and scanning (upstream epics), download management (existing `model-catalog.ts`), llama-swap runtime status (`epic-llama-swap.md`).

## Related tickets

- `FEAT-model-cards-with-metadata-panels-and-size-vram-surfacing.md`
- `FEAT-model-tags-search-and-filter-over-local-index.md`

## Acceptance Criteria

- [ ] Model cards render metadata (name, quant, params, ctx, base model) from the local index
- [ ] Search + category/base-model filters narrow the visible set
- [ ] Cards show file size / VRAM estimate and an update badge when a newer version exists


git issue: f243720
