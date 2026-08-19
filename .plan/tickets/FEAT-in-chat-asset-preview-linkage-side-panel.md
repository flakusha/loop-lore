# FEAT: In-chat asset preview + linkage side panel

**Status:** ✅ Done — in-chat asset preview + linkage side panel shipped in dev: `src/components/chat/gallery-sidebar.html` + `media-preview-modal.html` (toggle `showGallery`), `src/frontend/alpine/chat-utils/gallery.ts` (`openAssetPreview`/`loadGalleryAssets`/`getMediaStyle`), message attachments via `pendingAssets`→`sendMessage` (chat-send.ts + chat-editing.ts), upload→chat entity linkage (`entity_type=chat`). Git issue `fef7e3b` closed 2026-08-19.
**Priority:** medium
**Effort:** Medium
**Epic:** epic-asset-support-expansion

## Summary

Plan spec: .plan/tickets/FEAT-in-chat-asset-preview-linkage-side-panel.md

Item 7 (priority-release-010 row 7; P3 #12 / P5). Gallery assets viewable/linkable without leaving chat. Builds on gallery + assetRoutes (shipped). Dependency: C6 signed URLs (TASK-signed-urls-for-asset-downloads, **shipped + merged to dev 2026-08-17, commit 8d5da034**) — dependency cleared. Effort: Medium. See docs/frontend/chat/visual-novel-mode.md

## Acceptance Criteria

- [x] Implementation complete — sidebar + preview modal + message attachments + chat linkage shipped
- [x] Tests passing — chat-utils/chat-editing unit green
- [x] Documentation updated — ticket notes

## Worktree & Baseline (2026-08-16)

- Worktree: `tree/in-chat-asset-preview` (branch `in-chat-asset-preview`, based on `dev` @ c95cf320) — **deleted after finalize 2026-08-17; the C6 signed-URL scope was merged to dev. This ticket now covers only the remaining in-chat side-panel UI.**
- C6 dependency (signed URLs) is shipped + merged — unblocks this item.
- Baseline `bun run check`: 20/22 green — unit + e2e tests, typecheck, lint, wiring, db schema, md lint, changelog, code-map, context-weight all pass.
- Pre-existing strict-size debt on dev HEAD (NOT item scope, not introduced here): 10 files > 250L — `src/story/shared/story-utils.ts`, `src/services/actor-items.ts`, `src/rpg/location-nsfw/service.ts`, `src/routes/rpg/replayability.ts`, `src/routes/proactive-messaging/index.ts` (285L), `src/routes/messages/handle-scene-transitions.ts`, `src/routes/chats/manage.ts`, `src/generation/generate-route/stream-to-client.ts`, `src/generation/auto-gen/auto-generation.ts`, `src/generation/auto-gen/story-mode.ts`. No dedicated debt ticket yet — pending split work, both trees share the red strict-size gate.
- Note: pre-existing sibling worktree `tree/feature-in-chat-asset-preview` (same base, from prior planning session) left untouched.
