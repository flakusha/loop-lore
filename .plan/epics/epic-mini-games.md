<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Mini-Games & Interactive Mechanics

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Parent Epic:** 37 (Plugin System & Extensibility)
**Type:** Feature Epic

## Summary

Mini-games as plugins — poker, blackjack, dice games, slots, and other interactive mechanics that integrate into VN/chat/battle systems. Turns passive text into active engagement. Each game is a self-contained plugin that hooks into the story engine, battle system, and chat lifecycle.

## Core Concept

Mini-games are **first-class plugins** that:

1. Register as game handlers via the plugin API
2. Expose API routes for game state management
3. Render UI components (HTMX + Alpine.js)
4. Hook into chat/battle/VN for triggering
5. Emit events for rewards, reputation, relationship changes

## Game Catalog

### Tier 1 — Core (MVP)

| Game                | Complexity | Use Case                           |
| ------------------- | ---------- | ---------------------------------- |
| Dice (Yahtzee)      | Low        | Tavern gambling, quick bets        |
| Rock-Paper-Scissors | Low        | Quick NPC challenges, tie-breakers |
| Higher/Lower        | Low        | Simple card guessing, luck tests   |

### Tier 2 — Card Games

| Game           | Complexity | Use Case                                |
| -------------- | ---------- | --------------------------------------- |
| Blackjack      | Medium     | Casino scenes, high-stakes encounters   |
| Poker (5-Card) | Medium     | Tavern gambling, social manipulation    |
| Baccarat       | Medium     | 贵族 scenes, NPC gambling               |
| War            | Low        | Simple card battles for kids/low-stakes |

### Tier 3 — Advanced

| Game                | Complexity | Use Case                                 |
| ------------------- | ---------- | ---------------------------------------- |
| Poker Tournament    | High       | Multi-round event, reputation system     |
| Blackjack Side Bets | Medium     | Extended casino gameplay                 |
| Custom Card Games   | High       | User-defined rules, world-specific games |

### Tier 4 — Luck/Skill Hybrids

| Game       | Complexity | Use Case                          |
| ---------- | ---------- | --------------------------------- |
| Slots      | Low        | Quick dopamine, rare loot drops   |
| Roulette   | Medium     | Casino atmosphere, group gambling |
| Coin Flip  | Low        | Binary decisions, 50/50 stakes    |
| Dice Duels | Medium     | Direct player vs NPC contests     |

## Architecture

### Plugin Structure

```
plugins/
├── core/
│   ├── dice-roller/          # Existing — extend with Yahtzee
│   └── mini-games/           # NEW — mini-game framework
│       ├── plugin.ts         # Plugin manifest
│       ├── engine.ts         # Game engine base class
│       ├── state.ts          # Game state management (DB)
│       ├── rewards.ts        # Reward system (gold, XP, items)
│       ├── ui/               # HTMX/Alpine game UI
│       │   ├── layout.ts     # Game container/layout
│       │   ├── poker.ts      # Poker table UI
│       │   ├── blackjack.ts  # Blackjack table UI
│       │   ├── dice.ts       # Dice game UI
│       │   └── common.ts     # Shared components (chips, cards)
│       └── games/
│           ├── poker.ts      # Poker game logic
│           ├── blackjack.ts  # Blackjack game logic
│           ├── dice-yahtzee.ts  # Yahtzee variant
│           ├── rps.ts        # Rock-Paper-Scissors
│           ├── higher-lower.ts  # Higher or Lower
│           └── slots.ts      # Slot machine
├── community/                # Community-made games
└── local/                    # User custom games
```

### Core Types

```typescript
// ── Game Definition ─────────────────────────────────────────

/** A mini-game that can be played */
export interface MiniGame {
  /** Unique game identifier */
  id: string;
  /** Display name */
  name: string;
  /** Game category */
  category: "card" | "dice" | "luck" | "skill" | "hybrid";
  /** Description for UI */
  description: string;
  /** Thumbnail/icon */
  icon: string;
  /** Minimum players (1 = solo, 2+ = multiplayer) */
  minPlayers: number;
  /** Maximum players */
  maxPlayers: number;
  /** Game duration estimate (seconds) */
  estimatedDuration: number;
  /** Difficulty rating (1-5) */
  difficulty: number;
  /** Tags for filtering */
  tags: string[];

  /** Initialize a new game session */
  createSession(config: GameSessionConfig,): Promise<GameSession>;
  /** Process a player action */
  processAction(sessionId: string, action: GameAction,): Promise<GameResult>;
  /** Get current game state for UI rendering */
  getState(sessionId: string,): Promise<GameState>;
  /** Check if game is over */
  isOver(sessionId: string,): Promise<boolean>;
  /** Get final results */
  getResults(sessionId: string,): Promise<GameResults>;
}

// ── Game Session ────────────────────────────────────────────

export interface GameSession {
  id: string;
  gameId: string;
  players: GamePlayer[];
  state: GameState;
  createdAt: Date;
  updatedAt: Date;
  status: "waiting" | "active" | "paused" | "completed" | "cancelled";
}

export interface GamePlayer {
  userId: string;
  characterId?: string;
  seat: number;
  chips: number;
  bet: number;
  cards: Card[];
  isActive: boolean;
  isDealer?: boolean;
  isNPC?: boolean;
}

export interface GameState {
  phase: string;
  deck?: Card[];
  table?: Card[];
  discardPile?: Card[];
  currentTurn: number;
  pot?: number;
  round?: number;
  maxRounds?: number;
  custom?: Record<string, unknown>;
}

// ── Card & Dice ─────────────────────────────────────────────

export interface Card {
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  rank: "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
  faceUp: boolean;
}

export interface DiceSet {
  count: number;
  sides: number;
  results: number[];
  kept: number[]; // Indices of kept dice (Yahtzee)
}

// ── Actions & Results ───────────────────────────────────────

export type GameAction =
  | { type: "bet"; amount: number }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "fold" }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double_down" }
  | { type: "split" }
  | { type: "roll"; keep?: number[] }
  | { type: "choose"; choice: string | number }
  | { type: "discard"; indices: number[] }
  | { type: "custom"; data: Record<string, unknown> };

export interface GameResult {
  success: boolean;
  gameState: GameState;
  message: string;
  effects?: GameEffect[];
  isGameOver?: boolean;
}

export interface GameEffect {
  type: "gold" | "xp" | "item" | "reputation" | "intimacy" | "mood" | "memory";
  target: string; // userId or characterId
  amount?: number;
  itemId?: string;
  description: string;
}

export interface GameResults {
  winner?: string;
  rankings: GameRanking[];
  totalPot: number;
  effects: GameEffect[];
  summary: string;
}

export interface GameRanking {
  place: number;
  playerId: string;
  playerName: string;
  chips: number;
  profit: number;
}

// ── Game Session Config ─────────────────────────────────────

export interface GameSessionConfig {
  /** Game ID to play */
  gameId: string;
  /** Player user IDs */
  playerIds: string[];
  /** NPC opponents (character IDs) */
  npcIds?: string[];
  /** Starting chips per player */
  startingChips: number;
  /** Game-specific settings */
  settings?: Record<string, unknown>;
  /** Context: where was this game triggered from */
  context: "chat" | "battle" | "vn" | "tavern" | "admin";
  /** Chat ID if triggered from chat */
  chatId?: string;
  /** Character ID if triggered by NPC */
  characterId?: string;
}

// ── Integration Events ──────────────────────────────────────

export interface GameEvent {
  type: "game_started" | "game_action" | "game_ended" | "game_reward";
  gameId: string;
  sessionId: string;
  playerId: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ── Plugin API ──────────────────────────────────────────────

export interface MiniGameAPI {
  /** Register a new game */
  registerGame(game: MiniGame,): void;
  /** Get all registered games */
  listGames(): MiniGame[];
  /** Get game by ID */
  getGame(gameId: string,): MiniGame | undefined;
  /** Create a new session */
  createSession(config: GameSessionConfig,): Promise<GameSession>;
  /** Process player action */
  processAction(sessionId: string, playerId: string, action: GameAction,): Promise<GameResult>;
  /** Get game state */
  getState(sessionId: string,): Promise<GameState>;
  /** Forfeit/quit game */
  forfeit(sessionId: string, playerId: string,): Promise<void>;
}
```

### Database Schema

```sql
-- Game sessions
CREATE TABLE game_sessions (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  state JSON NOT NULL DEFAULT '{}',
  config JSON NOT NULL DEFAULT '{}',
  context TEXT,          -- 'chat' | 'battle' | 'vn' | 'tavern'
  chat_id TEXT,          -- FK to chats if triggered from chat
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

-- Game players
CREATE TABLE game_players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES game_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  character_id TEXT,     -- FK to characters if NPC
  seat INTEGER NOT NULL,
  chips INTEGER NOT NULL DEFAULT 0,
  bet INTEGER NOT NULL DEFAULT 0,
  cards JSON NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_dealer INTEGER NOT NULL DEFAULT 0,
  is_npc INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  left_at TEXT
);

-- Game results (audit trail)
CREATE TABLE game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES game_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  place INTEGER NOT NULL,
  chips_won INTEGER NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  items_won JSON,        -- [{itemId, quantity}]
  effects JSON,          -- [{type, target, amount, description}]
  summary TEXT,
  completed_at TEXT NOT NULL
);

-- Game statistics (aggregated per user)
CREATE TABLE game_stats (
  user_id TEXT NOT NULL REFERENCES users(id),
  game_id TEXT NOT NULL,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  total_winnings INTEGER NOT NULL DEFAULT 0,
  total_losses INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  favorite_game INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, game_id)
);
```

### API Routes

```
POST   /api/games                    — list available games
GET    /api/games/:gameId            — get game details
POST   /api/games/:gameId/start      — start new game session
POST   /api/games/sessions/:id/action — submit player action
GET    /api/games/sessions/:id/state — get current state
POST   /api/games/sessions/:id/join  — join existing session
POST   /api/games/sessions/:id/leave — leave/forfeit session
GET    /api/games/sessions/:id/results — get final results
GET    /api/games/stats              — get player stats
GET    /api/games/leaderboard        — get leaderboard
```

### Chat Integration

Mini-games integrate into chat via commands and NPC triggers:

```
/games                    — list available games
/play poker               — start poker game
/play blackjack           — start blackjack
/play dice                — play dice
/challenge @npc poker     — challenge NPC to poker
/gamble 100               — quick gamble (slots/coinflip)
```

NPCs can trigger games via the story engine:

```typescript
// NPC invites player to play
storyEngine.onEvent("npc_gambler_encounter", (npc, location,) => {
  if (location.type === "tavern" && npc.hasTrait("gambler",)) {
    return {
      type: "game_invite",
      game: "poker",
      npcId: npc.id,
      stakes: calculateStakes(npc.wealth,),
      dialogue: `${npc.name} slaps the table. "Fancy a game of poker, stranger?"`,
    };
  }
},);
```

### VN Mode Integration

In Visual Novel mode, mini-games appear as interactive scenes:

```typescript
// VN scene triggers mini-game
const vnScene: VNScene = {
  id: "casino_night",
  type: "game",
  game: "blackjack",
  participants: ["player", "rival_gambler",],
  stakes: { gold: 500, reputation: 10, },
  onSuccess: {
    dialogue: "You won big! The crowd cheers.",
    nextScene: "victory_celebration",
  },
  onFailure: {
    dialogue: "You lost everything. The rival laughs.",
    nextScene: "debt_consequences",
  },
};
```

### Battle System Integration

Mini-games can replace or augment battle mechanics:

```typescript
// Battle gamble — risk health for bonus loot
interface BattleGamble {
  type: "high_stakes";
  game: "dice_duel";
  wager: "health" | "mana" | "item";
  wagerAmount: number;
  bonusLoot: LootTable;
  penaltyEffect: StatusEffect;
}
```

## Implementation Phases

### Phase 1: Framework (Week 1-2)

- [ ] Game engine base class and types
- [ ] Game session state management (DB)
- [ ] Game reward system (gold, XP, items)
- [ ] Game stats tracking
- [ ] Plugin manifest for mini-games
- [ ] Basic HTMX/Alpine game UI container

### Phase 2: Tier 1 Games (Week 3-4)

- [ ] Rock-Paper-Scissors (simplest, validate framework)
- [ ] Higher/Lower (card guessing)
- [ ] Yahtzee (extend existing dice roller)
- [ ] Coin Flip (binary gamble)

### Phase 3: Card Games (Week 5-7)

- [ ] Blackjack (hit/stand/double/split)
- [ ] Poker (5-card draw, betting, bluffing)
- [ ] Card deck/shuffle/deal utilities
- [ ] Betting chip system

### Phase 4: Chat Integration (Week 8-9)

- [ ] `/games`, `/play`, `/challenge` commands
- [ ] NPC game invitations via story engine
- [ ] Chat-triggered game sessions
- [ ] Game results in chat history

### Phase 5: VN & Battle Integration (Week 10-11)

- [ ] VN scene type: "game"
- [ ] Battle gamble system
- [ ] Game consequences (reputation, relationships)
- [ ] NPC gambling AI (personality-based play styles)

### Phase 6: Advanced (Week 12+)

- [ ] Poker tournament system
- [ ] Leaderboards and achievements
- [ ] Custom card game builder
- [ ] Community game plugins
- [ ] Slots machine
- [ ] Roulette

## Game-Specific Details

### Blackjack Rules

- Standard 52-card deck
- Dealer stands on 17
- Player can: Hit, Stand, Double Down, Split (pair only)
- Blackjack pays 3:2
- Insurance on dealer Ace
- Surrender option (lose half bet)

### Poker Rules (5-Card Draw)

- Standard 52-card deck
- 2-6 players (human + NPC)
- Blinds: small (10), big (25)
- Phases: Deal → Bet → Draw → Bet → Showdown
- Hand rankings: Royal Flush → High Card
- Bluffing mechanic: NPCs have detectable tells

### Yahtzee Rules

- 5 dice, 3 rolls per turn
- 13 categories (ones through sixes, three/four of a kind, full house, small/large straight, Yahtzee, chance)
- Yahtzee bonus: +100 for additional Yahtzees
- Scorecard management

### Rock-Paper-Scissors

- Best of 3/5 rounds
- NPC patterns based on personality
- Streak bonuses
- Used as tie-breaker in other games

## Files

- `plugins/core/mini-games/` — mini-game plugin (new)
- `src/plugins/types.ts` — extend with game types (if needed)
- `src/db/schema-core.ts` — add game tables
- `src/routes/games.ts` — game API routes
- `src/frontend/alpine/games.ts` — game UI modules
- `src/public/css/games.css` — game-specific styles
- `src/assistant/commands/games.ts` — chat commands
- `docs/spec/mini-games.md` — game rules reference

## Open Questions

1. **Real-time vs turn-based**: Should multiplayer games be real-time (WebSocket) or turn-based (polling)?
2. **NPC AI depth**: How smart should NPC gambling AI be? (personality-based vs optimal play)
3. **Economy balance**: How to prevent gold farming through game exploits?
4. **NSFW variants**: Should there be NSFW game variants (strip poker, etc.)?
5. **Offline play**: Can games be played without LLM generation?
6. **Spectating**: Should other players be able to watch ongoing games?
7. **Chat flooding**: How to prevent game actions from flooding chat?
8. **Save/load**: Can game sessions be saved and resumed later?

## Cross-References

- **Epic 37 (Plugin System)** — mini-games are plugins, use plugin API
- **Epic 22 (RPG Mechanics)** — dice engine, stats, XP integration
- **Epic 36 (Chat Lifecycle)** — game commands, NPC triggers
- **Epic 51 (Visual Novel Mode)** — VN game scenes
- **Epic 43 (NSFW Game Mechanics)** — NSFW game variants (future)
- `plugins/core/dice-roller/` — existing dice engine, extend for Yahtzee

## Linked Tasks

- TASK-mini-games.md
- TASK-plugin-marketplace.md (community game plugins)
