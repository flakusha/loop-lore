# TASK: Chat: Visual Novel Mode

**Status:** 🟡 Backend Complete / Frontend Not Started
**Priority:** medium
**Effort:** Medium-High (frontend rendering)
**Epic:** epic-immersion-presentation
**Git Issues:** `8be84a7` (frontend implementation), `cb9e1b7` (chat settings toggle)

## Summary

Visual novel mode: image + text overlay, transitions, typewriter effect, 3 layout modes. From docs/frontend/chat/visual-novel-mode.md.

## Acceptance Criteria

- [ ] Implementation complete (frontend)
- [ ] Tests passing
- [ ] Documentation updated

## Backend Status: ✅ Complete

- DB column `chats.visual_novel` (migration `027_gm_config_visual_novel`)
- API `ChatCreateBody`/`ChatUpdateBody` accept `visualNovel: boolean`
- `src/chat/service.ts` handles `visualNovel` → `visual_novel`
- `src/routes/chats.ts` GET/PUT pass `visualNovel` through
- `src/validation/schemas.ts` includes `visualNovel` in `GmConfigSchema`, `ChatCreateBody`, `ChatUpdateBody`

## Frontend Plan

See `TASK-visual-novel-mode.md` for the full phased implementation plan.
