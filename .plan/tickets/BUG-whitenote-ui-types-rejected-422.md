<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: whitenote UI types rejected 422

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small

## Summary

gm-panel.html:120-121 offers character_context/world_state, WhiteneoteBody.type (src/routes/gm-notes/schemas.ts:24-31) + WhiteneoteType (src/db/enums-gm.ts:26-35) = narrative_direction|character_motivation|plot_thread|tone|pacing|theme -> valid-looking UI selection 422s. Fix: align enum+UI.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
