<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Image backends x gallery: provenance filter + backend attribution validation

**Status:** Not Started
**Priority:** medium
**Effort:** Small-Medium (survey + validation + gap tickets)
**Epic:** epic-frontend-gallery.md
**Summary:** Survey + validate how generated images (sd.cpp, ComfyUI standalone/proxy, external OpenAI-compatible) surface in gallery. Ground state: gallery FE is search + type filter only (src/frontend/pages/gallery.ts, 29L — no backend awareness); server view (src/routes/views/gallery.ts) enforces G6 visibility inheritance (private-character assets hidden from non-owners, admin.character bypass).
**Context:** Image-backends cross-cutting audit (2026-09-25). Open: (1) no provenance filter (prompt-generated vs uploaded vs edited indistinguishable in grid); (2) no backend attribution (which provider/model/workflow produced the asset — needed to debug quality + reproduce); (3) G6 inheritance covers actor-linked assets — verify chat/message-linked generated assets inherit the same hide-from-non-participant rule (checkChatAccess parity).

**Acceptance Criteria:**
- [ ] Provenance (generated/uploaded/edited) validated end-to-end: assets carry the distinction or a gap ticket is filed.
- [ ] Backend attribution (provider/model/workflow) validated: recorded at generation time or gap ticket filed.
- [ ] G6 inheritance for chat/message-linked generated assets verified (checkChatAccess parity) — fix or ticket for any gap.
- [ ] Findings land in the audit doc with file:line references.
- [ ] `bun run check` green.

**Tags:** image-backends, gallery, provenance, attribution, visibility
**Related:** src/frontend/pages/gallery.ts, src/routes/views/gallery.ts


git issue: 8a8abbd
