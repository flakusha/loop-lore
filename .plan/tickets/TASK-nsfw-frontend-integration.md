# TASK: NSFW Frontend Integration

**Status:** ⬜ Not Started
**Priority:** P0
**Effort:** High
**Epic:** epic-frontend-backend-integration
**Tags:** nsfw, frontend, intimacy, body-state, ui

## Summary

Create the complete NSFW interaction interface for intimacy system, body state display, and housing management. Backend routes exist at `/api/nsfw/*` but no frontend UI exists.

## Current State

- No frontend code for NSFW
- Backend has full NSFW system in `src/routes/nsfw.ts`, `src/routes/nsfw-moderation.ts`
- NSFW UI epic (`epic-nsfw-ui.md`) has detailed component specs

## What to Implement

### Phase 1: Intimacy Interface

- Intimacy action selection (kiss, embrace, talk, play, rest)
- Partner selection
- Action effects display
- Consent confirmation dialog
- Privacy controls

### Phase 2: Body State Display

- Health/mood/energy bars for each actor
- Status indicators (healthy, well-rested, happy)
- Stats display (affection, trust, comfort)

### Phase 3: Housing Management

- Housing overview with rooms
- Room customization
- Furniture placement
- Storage management

## Files to Create

- `src/frontend/nsfw/intimacy-interface.ts` — Intimacy UI
- `src/frontend/nsfw/body-state.ts` — Body state widget
- `src/frontend/nsfw/housing-management.ts` — Housing UI
- `src/frontend/alpine/nsfw.ts` — Alpine.js NSFW logic
- `src/components/nsfw/intimacy-panel.html` — Intimacy panel template
- `src/components/nsfw/body-state.html` — Body state template
- `src/components/nsfw/housing-panel.html` — Housing panel template

## Acceptance Criteria

- [ ] Intimacy action selection interface
- [ ] Partner selection UI
- [ ] Action effects display
- [ ] Consent confirmation dialog
- [ ] Privacy controls
- [ ] Body state display (health, mood, energy)
- [ ] Status indicators
- [ ] Housing overview
- [ ] Room customization
- [ ] Furniture placement
- [ ] Storage management
- [ ] Mobile responsive
- [ ] Keyboard accessible

## Related

- `epic-nsfw-ui.md` — NSFW UI epic (detailed specs)
- `epic-nsfw-game-mechanics.md` — Backend NSFW systems
- `epic-nsfw-integration-gaps.md` — NSFW integration
- `TASK-nsfw-alpine.md` — Existing task (needs updating)
- `TASK-nsfw-intimacy-interface.md` — Existing task
- `TASK-nsfw-body-state.md` — Existing task
- `TASK-nsfw-housing-management.md` — Existing task
