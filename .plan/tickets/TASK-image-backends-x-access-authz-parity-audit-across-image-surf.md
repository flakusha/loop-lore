<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Image backends x access: authz parity audit across image surfaces

**Status:** ⬜ Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-comfyui-plugin
**Tags:** access, authz, audit

**Summary:** Matrix audit of authz across all image surfaces (generation, edit, assets, gallery, LoRA, matting, avatars) with file:line evidence; fix tickets for each gap.

**Context:**

Audit authorization consistency across every image ingress/egress: POST /api/v1/generation/image (401 + checkChatAccess on chatId, image-gen-route.ts:55-70), POST /api/v1/image-edit/run (NO auth — bare Request, handleRun routes.ts:61; fix tracked in image-edit authz ticket), asset raw/thumb/download (actorId/actorRole + chatId + signed URL, controller.ts:300+), gallery view (G6 inheritance, views/gallery.ts), LoRA discover/validate routes, matting endpoints, avatar generation paths. Backends in scope: sd.cpp, ComfyUI standalone + proxy, external OpenAI-compatible image APIs. Deliverable: matrix (surface x check: auth-required, chat-ownership, template-ownership, signed-URL) marking each ✅/❌ with file:line, file fix tickets for each ❌ (or fix inline if Small). Known ❌ already: image-edit run (tracked). Suspects to verify: LoRA management routes, matting comfy provider, unlinked (no-chatId) generation quota, gallery search endpoint auth. Tests: 401/403 matrix per surface.

**Acceptance Criteria:**

- [ ] Matrix published (surface x auth-required/chat-ownership/template-ownership/signed-URL, ✅/❌ + file:line)
- [ ] Fix ticket per ❌ (or inline fix if Small)
- [ ] Tests: 401/403 matrix per surface
- [ ] Documentation updated
