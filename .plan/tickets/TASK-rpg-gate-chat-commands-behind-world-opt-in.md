<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: RPG: gate chat commands behind world opt-in

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-mechanics-governance.md

## Summary

Gap G4 (verified): zero rpg_enabled/checkRpgEnabled refs in src/assistant/; gate used only by src/routes/rpg/stats-actor.ts. Enforce checkRpgEnabled in /roll /attack /battle /check and other RPG commands; disabled world -> clean 'RPG not enabled' reply, no roll, no history write. Land with /check ticket. Plan doc §3.4. Epic: epic-mechanics-governance.md.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
