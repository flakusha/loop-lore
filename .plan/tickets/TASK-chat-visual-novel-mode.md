# TASK: Chat: Visual Novel Mode

**Status:** 🟡 Partial — frontend VN renderer foundation complete (6 files in src/frontend/vn/), choice/branching UI + chat.html wiring pending
**Priority:** medium
**Effort:** Medium-High (frontend rendering)
**Epic:** epic-immersion-presentation

## Summary

Visual novel mode: image + text overlay, transitions, typewriter effect, 3 layout modes. Backend complete, frontend rendering foundation complete (2026-07-31).

## Scope

### Backend (Complete)

- VN mode state management
- Scene transition logic
- Choice/branching system

### Frontend (Foundation Complete, Wiring Pending)

- ✅ VN renderer component (`src/frontend/vn/scene-renderer.ts`)
- ✅ Image display with transitions (`src/frontend/vn/transition-engine.ts`)
- ✅ Text overlay with typewriter effect (`src/frontend/vn/typewriter.ts`)
- ❌ Choice/branching UI (not started)
- ✅ 3 layout modes (overlay, below, split) — CSS + renderer
- ❌ Not yet wired into `chat.html` (conditional VN vs bubble layout)

### Layout Modes

- **Full (overlay)** — Image takes full screen, text overlay ✅
- **Split** — Image left, text right ✅
- **Below** — Image top, text bottom ✅

## Linked Epics

- `epic-immersion-presentation.md`

## Acceptance Criteria

- [x] VN renderer component implemented
- [x] Image display with transitions (fade, slide, etc.)
- [x] Text overlay with typewriter effect
- [ ] Choice/branching UI
- [x] 3 layout modes (overlay, below, split)
- [x] Scene transition animations
- [ ] Mobile-responsive design (needs testing)
- [ ] Integration with backend VN state (needs chat.html wiring)
- [ ] Unit tests for VN renderer
- [ ] Integration tests for VN workflow

## Notes

- Backend is complete — frontend foundation done 2026-07-31
- VN module at `src/frontend/vn/` — 6 files: settings, typewriter, transition-engine, portrait-manager, scene-renderer, index
- GmConfig extended with 12 VN fields; ChatState extended with VN state
- Next: wire into `chat.html` for conditional VN vs bubble rendering
