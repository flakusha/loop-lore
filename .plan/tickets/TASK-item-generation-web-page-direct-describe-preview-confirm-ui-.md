<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Item generation web page: direct describe-preview-confirm UI reusing the assistant pipeline

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium

## Summary

Assistant /create item works, and TASK-world-item-frontend covers manual item CRUD — but there is no direct web page for LLM-assisted item generation: no *item* match under src/{views,partials,components,frontend}, and world-edit.html has no generation UI either. Design a separate item generation page (src/views/item-generate.html + Alpine component + partial) that mirrors the assistant review flow for direct web use: describe field -> POST through the same generation+gates path as /create -> preview with warnings (duplicate/consistency) -> explicit confirm calling POST /api/chats/:id/create-entity or a world-scoped equivalent -> success links to the created item. Ownership-gated (owner/admin), loading/error states, no silent persists. Reference TASK-gallery-asset-reuse-picker-for-world-location-item-creation for attaching gallery assets to generated items. This page establishes the pattern; world/location/character web-generation pages follow as separate tickets. Acceptance: full describe->preview->confirm cycle in browser with no chat involved; gated to owners; check green.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
