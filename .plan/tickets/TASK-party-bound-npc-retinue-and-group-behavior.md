<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Party Bound NPC Retinue And Group Behavior

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-party-migration
**Tags:** party, npc, behavior

**Summary:**
Bind NPCs (minions, guards) into a party; party-bound NPCs follow `defend-member`, `scatter`, `regroup` group behaviors.

**Context:**
A party can include NPCs from a retinue (see `epic-npcs` retinue ticket). When the party fights, those NPCs defend their leader (or flee on leader death).

**Acceptance Criteria:**
- `party_member.role` extended with `npc_guard`, `npc_cadre`.
- Group behavior hooks: `onLeaderAttacked` triggers defend; `onLeaderDeath` triggers scatter/regroup based on loyalty enum.
- Implementation reuses `epic-npcs` retinue data; this ticket extends party logic to honor it.
- Tests: boss attacked -> guards defend; boss killed -> guards scatter.
