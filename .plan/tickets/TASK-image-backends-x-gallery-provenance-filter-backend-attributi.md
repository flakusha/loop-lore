<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Image backends x gallery: provenance filter + backend attribution validation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-comfyui-plugin
**Tags:** gallery, provenance, access

**Summary:** Validate generated-image surfacing in gallery: provenance filter, backend attribution, G6 parity for chat/message-linked assets.

**Context:**

Survey + validate how generated images (sd.cpp, ComfyUI standalone/proxy, external OpenAI-compatible) surface in gallery. Ground state: gallery FE is search + type filter only (src/frontend/pages/gallery.ts, 29L — no backend awareness); server view (src/routes/views/gallery.ts) enforces G6 visibility inheritance (private-character assets hidden from non-owners, admin.character bypass). Open: (1) no provenance filter (prompt-generated vs uploaded vs edited indistinguishable in grid); (2) no backend attribution (which provider/model/workflow produced the asset — needed to debug quality + reproduce); (3) G6 inheritance covers actor-linked assets — verify chat/message-linked generated assets inherit the same hide-from-non-participant rule (checkChatAccess parity with image-gen-route.ts:55-70). Scope: read-path validation + filter UI only; store provenance at createAsset time if missing (provider, model/workflow, seed?) — check what asset metadata already carries first. Tests: G6 parity for generated assets, provenance filter roundtrip.

**Acceptance Criteria:**

- [ ] G6 parity verified for chat/message-linked generated assets (or fix ticket filed)
- [ ] Provenance filter + backend attribution scoped (store-at-create vs derive-at-read decided)
- [ ] Tests: G6 parity, filter roundtrip
- [ ] Documentation updated
