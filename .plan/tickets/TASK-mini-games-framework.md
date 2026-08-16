<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Mini-Games Framework + Tier 1

**Epic:** Mini-Games & Interactive Mechanics
**Phase:** 1 (Framework + Tier 1 Games)
**Priority:** High
**Effort:** High

## Goal

Build the mini-game plugin framework and implement 4 Tier 1 games: Rock-Paper-Scissors, Higher/Lower, Yahtzee, and Coin Flip.

## Tasks

### 1.1 Game Engine Framework

**Files:** `plugins/core/mini-games/`

- [ ] `types.ts` — Core types (MiniGame, GameSession, GamePlayer, GameState, GameAction, GameResult, GameEffect, Card, DiceSet)
- [ ] `engine.ts` — Game engine base class, session management, action processing
- [ ] `state.ts` — DB-backed game state persistence (CRUD for sessions, players)
- [ ] `rewards.ts` — Reward distribution (gold, XP, items, reputation, mood)
- [ ] `stats.ts` — Player statistics tracking (games played/won, streaks, earnings)
- [ ] `deck.ts` — Card utilities (create deck, shuffle, deal, sort, evaluate hands)
- [ ] `plugin.ts` — Plugin manifest, register routes, event handlers

### 1.2 Database Schema

**Files:** `migrations/`, `src/db/`

- [ ] `030_mini_games.ts` — Migration: game_sessions, game_players, game_results, game_stats tables
- [ ] `src/db/schema-core.ts` — Add table types to Kysely DB type

### 1.3 API Routes

**Files:** `plugins/core/mini-games/routes.ts`

- [ ] `GET /api/games` — List available games
- [ ] `GET /api/games/:gameId` — Get game details
- [ ] `POST /api/games/:gameId/start` — Start new session
- [ ] `POST /api/games/sessions/:id/action` — Submit player action
- [ ] `GET /api/games/sessions/:id/state` — Get current state
- [ ] `POST /api/games/sessions/:id/join` — Join session
- [ ] `POST /api/games/sessions/:id/leave` — Leave/forfeit
- [ ] `GET /api/games/sessions/:id/results` — Get results
- [ ] `GET /api/games/stats` — Player stats
- [ ] `GET /api/games/leaderboard` — Leaderboard

### 1.4 HTMX/Alpine UI

**Files:** `src/frontend/alpine/games.ts`, `src/public/css/games.css`

- [ ] Game list component (browse available games)
- [ ] Game session container (render game-specific UI)
- [ ] Player hand display (cards, dice)
- [ ] Action buttons (hit, stand, bet, roll, etc.)
- [ ] Chip stack display
- [ ] Results popup
- [ ] Stats sidebar

### 1.5 Tier 1 Games

**Files:** `plugins/core/mini-games/games/`

#### Rock-Paper-Scissors

- [ ] `rps.ts` — Game logic (best of 3/5, NPC AI based on personality)
- [ ] `rps.test.ts` — Unit tests
- [ ] API: `/api/games/rps/start`, `/api/games/rps/throw`

#### Higher/Lower

- [ ] `higher-lower.ts` — Card guessing (bet on higher/lower next card)
- [ ] `higher-lower.test.ts` — Unit tests
- [ ] API: `/api/games/higher-lower/start`, `/api/games/higher-lower/guess`

#### Yahtzee (Dice)

- [ ] `yahtzee.ts` — Yahtzee logic (5 dice, 13 categories, 3 rolls/turn)
- [ ] `yahtzee.test.ts` — Unit tests
- [ ] API: `/api/games/yahtzee/start`, `/api/games/yahtzee/roll`, `/api/games/yahtzee/score`

#### Coin Flip

- [ ] `coinflip.ts` — Binary gamble (heads/tails, configurable stakes)
- [ ] `coinflip.test.ts` — Unit tests
- [ ] API: `/api/games/coinflip/start`, `/api/games/coinflip/flip`

### 1.6 Chat Commands

**Files:** `src/assistant/commands/games.ts`

- [ ] `/games` — List available games
- [ ] `/play <game>` — Start a game
- [ ] `/challenge @<npc> <game>` — Challenge NPC
- [ ] `/gamble <amount>` — Quick gamble (coinflip/slots)

### 1.7 Testing

- [ ] Unit tests for all game engines
- [ ] Integration tests for API routes
- [ ] E2E test: create session → play game → get results

## Dependencies

- Epic 37 (Plugin System) — plugin loader, registry, types
- Epic 22 (RPG Mechanics) — dice engine (extend for Yahtzee)
- Epic 36 (Chat Lifecycle) — command system, NPC triggers

## Verification

```bash
bun run check        # typecheck + lint + format
bun test src/        # unit tests
bun test plugins/    # plugin tests
E2E_SAFEGUARD=1 bun test tests/e2e/  # e2e (if affecting)
```

## Files Changed

| File                                            | Action | Description          |
| ----------------------------------------------- | ------ | -------------------- |
| `plugins/core/mini-games/plugin.ts`             | Create | Plugin manifest      |
| `plugins/core/mini-games/types.ts`              | Create | Core game types      |
| `plugins/core/mini-games/engine.ts`             | Create | Game engine base     |
| `plugins/core/mini-games/state.ts`              | Create | DB state management  |
| `plugins/core/mini-games/rewards.ts`            | Create | Reward system        |
| `plugins/core/mini-games/stats.ts`              | Create | Player stats         |
| `plugins/core/mini-games/deck.ts`               | Create | Card utilities       |
| `plugins/core/mini-games/routes.ts`             | Create | API routes           |
| `plugins/core/mini-games/games/rps.ts`          | Create | Rock-Paper-Scissors  |
| `plugins/core/mini-games/games/higher-lower.ts` | Create | Higher/Lower         |
| `plugins/core/mini-games/games/yahtzee.ts`      | Create | Yahtzee              |
| `plugins/core/mini-games/games/coinflip.ts`     | Create | Coin Flip            |
| `migrations/030_mini_games.ts`                  | Create | DB migration         |
| `src/db/schema-core.ts`                         | Edit   | Add game table types |
| `src/frontend/alpine/games.ts`                  | Create | Game UI modules      |
| `src/public/css/games.css`                      | Create | Game styles          |
| `src/assistant/commands/games.ts`               | Create | Chat commands        |
