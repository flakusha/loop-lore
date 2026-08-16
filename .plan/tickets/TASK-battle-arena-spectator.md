<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Battle Arena & Spectator Mode

**Priority:** Medium
**Status:** ⬜ Not Started
**Epic:** epic-battle-action-systems
**Tags:** battle, arena, spectator, replay, competitive

## Description

Add a battle arena system where characters can challenge each other or NPCs to structured combat, with spectator mode for watching battles and a replay system for reviewing past fights. Extends the Battle & Action Systems epic with competitive and social layers.

## How It Extends Existing Work

Builds on the Battle Action Systems epic's turn-based mechanics, battle UI, and battle state. Adds spectating and replay on top of the existing battle infrastructure.

## Acceptance Criteria

- [ ] Arena challenge system (player vs player, player vs NPC, tournament bracket)
- [ ] Spectator mode — watch ongoing battles from a third-person perspective
- [ ] Battle replay system — record and replay full battle sequences
- [ ] Arena leaderboard (win/loss records, streaks, ratings)
- [ ] Spectator chat during battles
- [ ] Spectator can place bets (links to Economy epic for currency)
- [ ] `POST /api/battle/arena/challenge` route
- [ ] `GET /api/battle/arena/:id/replay` route
- [ ] Frontend arena lobby with challenge, spectate, and replay tabs

## Technical Notes

- Battle replay stored as serialized action log (turn-by-turn)
- Spectator mode uses separate WebSocket channel per arena
- Leaderboard uses ELO or Glicko-2 rating system
- Bets integrate with existing economy/currency system (Epic: Economy & Trading)
