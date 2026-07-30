# TASK: Chat: Visual Novel Mode

**Status:** 🟡 Backend Complete / Frontend Not Started
**Priority:** medium
**Effort:** Medium-High (frontend rendering)
**Epic:** epic-immersion-presentation

## Summary

Visual novel mode: image + text overlay, transitions, typewriter effect, 3 layout modes. Backend complete, frontend rendering needed.

## Scope

### Backend (Complete)

- VN mode state management
- Scene transition logic
- Choice/branching system

### Frontend (Needed)

- VN renderer component
- Image display with transitions
- Text overlay with typewriter effect
- Choice/branching UI
- 3 layout modes (full, split, overlay)

### Layout Modes

- **Full** — Image takes full screen, text overlay
- **Split** — Image left, text right
- **Overlay** — Image background, text box overlay

## Linked Epics

- `epic-immersion-presentation.md`

## Acceptance Criteria

- [ ] VN renderer component implemented
- [ ] Image display with transitions (fade, slide, etc.)
- [ ] Text overlay with typewriter effect
- [ ] Choice/branching UI
- [ ] 3 layout modes (full, split, overlay)
- [ ] Scene transition animations
- [ ] Mobile-responsive design
- [ ] Integration with backend VN state
- [ ] Unit tests for VN renderer
- [ ] Integration tests for VN workflow

## Notes

- Backend is complete — focus on frontend rendering
- Follow existing Alpine.js patterns
- Reference `TASK-visual-novel-mode.md` for full VN implementation
