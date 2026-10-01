<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Image backends x access: authz parity audit across image surfaces

**Status:** Not Started
**Priority:** high
**Effort:** Medium (audit matrix + fix tickets or inline small fixes)
**Epic:** epic-asset-platform-capabilities.md
**Summary:** Audit authorization consistency across every image ingress/egress: `POST /api/v1/generation/image` (401 + checkChatAccess on chatId, image-gen-route.ts:55-70), `POST /api/v1/image-edit/run` (NO auth — bare Request, handleRun routes.ts:61; fix tracked in the image-edit authz ticket), asset raw/thumb/download (actorId/actorRole + chatId + signed URL, controller.ts:300+), gallery view (G6 inheritance, views/gallery.ts), LoRA discover/validate routes, matting endpoints, avatar generation paths. Backends in scope: sd.cpp, ComfyUI standalone + proxy, external OpenAI-compatible image APIs.
**Context:** Image-backends cross-cutting audit (2026-09-25). One surface (image-edit/run) ships with no auth while its sibling generation route enforces chat access — the audit pins down every surface's current check and closes the gaps.

**Acceptance Criteria:**
- [ ] Matrix delivered: surface × check (auth-required, chat-ownership, template-ownership, signed-URL), each cell ✅/❌ with file:line.
- [ ] Every ❌ gets a fix ticket (or is fixed inline when Small) — no silent gaps carried forward.
- [ ] `POST /api/v1/image-edit/run` authz gap cross-referenced to the image-edit authz ticket (owned by that worktree).
- [ ] Audit doc lands under `docs/meta/` or the epic; re-audit instructions recorded.
- [ ] `bun run check` green.

**Tags:** image-backends, authz, audit, security
**Related:** src/generation/image-gen-route.ts, src/image-edit/, src/routes/views/gallery.ts


git issue: 3e20b22
