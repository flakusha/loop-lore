<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: whitenote UI types rejected 422

**Status:** ✅ Resolved (fixed 2026-09-05)
**Priority:** medium
**Effort:** Small

## Summary

gm-panel.html:120-121 offers character_context/world_state, WhiteneoteBody.type (src/routes/gm-notes/schemas.ts:24-31) + WhiteneoteType (src/db/enums-gm.ts:26-35) = narrative_direction|character_motivation|plot_thread|tone|pacing|theme -> valid-looking UI selection 422s. Fix: align enum+UI.

## Resolution

Fixed 2026-09-05. Verified `bun test src/routes/gm-notes.test.ts` (7 pass, including "enum values accepted for both note types" which iterates `Object.values(WhiteneoteType)`):

- `src/db/enums-gm.ts:33-34` — `WhiteneoteType` gains `CharacterContext: "character_context"` and `WorldState: "world_state"`; the type derives from the const (`schema-gm.ts:29` types `type: WhiteneoteType`).
- `src/routes/gm-notes/schemas.ts:31-32` — `WhiteneoteBody.type` union gains `"character_context"` and `"world_state"`.
- FE already matched (`src/components/chat/gm-panel.html:120-121`, `src/frontend/alpine/gm-panel.ts:32`) — not touched. No migration (text column, app-level typing).

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
