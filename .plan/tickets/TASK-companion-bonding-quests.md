<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Companion Bonding Quests & Companion Legacy

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-companion-pet-mount
**Tags:** companion, bonding, quests, legacy, pet-battle

## Description

Add companion bonding quests and companion legacy mechanics to the Companion, Pet & Mount epic — companions can embark on solo side quests, bond with the player through shared experiences, and pass on traits to future companions. Extends the companion system from passive allies to active participants with their own arcs.

## How It Extends Existing Work

Builds on the Companion, Pet & Mount epic's companion types, loyalty system, relationship model, and AI behavior. Adds quest-giving, bonding events, and legacy inheritance on top of the existing companion mechanics.

## Acceptance Criteria

- [ ] Companion side quests — companions can initiate and complete quests independently
- [ ] Bonding events — shared experiences that boost loyalty and unlock new abilities
- [ ] Companion legacy — when a companion retires, pass traits to a new companion of same type
- [ ] Bonding level system (Stranger → Acquaintance → Ally → Trusted → Bonded)
- [ ] Companion personality evolution based on bonding events
- [ ] `GET /api/companions/:id/bonding` — bonding status and history
- [ ] `POST /api/companions/:id/quest` — assign a side quest
- [ ] Frontend companion bonding panel with relationship meter
- [ ] Frontend companion quest log

## Technical Notes

- Bonding levels stored as numeric value (0-100) with threshold thresholds
- Companion quests use existing quest system infrastructure (Epic: RPG Mechanics)
- Legacy inheritance uses same mechanism as Character Legacy (TASK-character-legacy-heir)
- Companion personality evolution modifies AI behavior params over time
