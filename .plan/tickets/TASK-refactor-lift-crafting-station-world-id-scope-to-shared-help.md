<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Refactor: lift crafting-station world_id scope to shared helper

**Status:** ✅ Done — helper landed as `worldScoped` + `validateWorldAccess` (`src/db/world-scope.ts` + test); adopted in `crafting/stations.ts` list paths; sweep 2026-09-10: all other `world_id` queries carry explicit `WHERE world_id = ?` (npc-nav, playthrough, skills, encounters, intimacy, traits, blog, orders, recipes)
**Priority:** high
**Effort:** Medium

## Summary

TASK-lift-world-scope-to-shared-helper — see .plan/tickets/TASK-lift-world-scope-to-shared-helper.md. Triggered by 7e0687f4 fix; pattern repeats across crafting/intimacy/seduction routes.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
