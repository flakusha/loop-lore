<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Mini-Games: UI Components & API Contracts

## UI Component Library

### Base Components

**GameCard Component:**

```typescript
interface GameCardProps {
  rank: "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";
  suit: "hearts" | "diamonds" | "clubs" | "spades";
  faceDown?: boolean;
  selected?: boolean;
  onClick?: () => void;
  animation?: "deal" | "flip" | "discard";
}
```

**HTML Structure:**

```html
<div class="game-card" data-suit="hearts" data-rank="A">
  <div class="card-face front">
    <span class="card-rank">A</span>
    <span class="card-suit">♥</span>
  </div>
  <div class="card-face back">
    <span class="card-pattern">♠</span>
  </div>
</div>
```

**CSS (BEM):**

```css
.game-card {
  width: 60px;
  height: 90px;
  border-radius: 8px;
  perspective: 1000px;
  cursor: pointer;
}

.game-card__face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  transition: transform 0.6s;
}

.game-card__face--front {
  background: white;
  border: 1px solid #ccc;
}

.game-card__face--back {
  background: linear-gradient(135deg, #1a237e 25%, #283593 25%, #283593 50%, #1a237e 50%, #1a237e 75%, #283593 75%);
  transform: rotateY(180deg);
}

.game-card--selected .game-card__face--front {
  border: 3px solid #4caf50;
  box-shadow: 0 0 10px #4caf50;
}

.game-card--face-down .game-card__face--front {
  transform: rotateY(180deg);
}

.game-card--face-down .game-card__face--back {
  transform: rotateY(0);
}

/* Suit colors */
.game-card[data-suit="hearts"] .card-suit,
.game-card[data-suit="diamonds"] .card-suit {
  color: #e53935;
}

.game-card[data-suit="clubs"] .card-suit,
.game-card[data-suit="spades"] .card-suit {
  color: #212121;
}

/* Animations */
.game-card--deal {
  animation: deal 0.5s ease-out;
}

@keyframes deal {
  from {
    transform: translateX(-100px) translateY(-100px) rotate(-20deg);
  }
  to {
    transform: translateX(0) translateY(0) rotate(0);
  }
}

.game-card--flip {
  animation: flip 0.6s ease-in-out;
}

@keyframes flip {
  0% {
    transform: rotateY(0);
  }
  50% {
    transform: rotateY(90deg);
  }
  100% {
    transform: rotateY(180deg);
  }
}
```

---

**GameDice Component:**

```typescript
interface GameDiceProps {
  value: 1 | 2 | 3 | 4 | 5 | 6;
  size?: "sm" | "md" | "lg";
  rolling?: boolean;
  kept?: boolean;
  onClick?: () => void;
}
```

**HTML Structure:**

```html
<div class="game-dice game-dice--md" data-value="6">
  <div class="dice-face">
    <span class="dice-dot" data-pos="tl"></span>
    <span class="dice-dot" data-pos="tr"></span>
    <span class="dice-dot" data-pos="ml"></span>
    <span class="dice-dot" data-pos="mr"></span>
    <span class="dice-dot" data-pos="bl"></span>
    <span class="dice-dot" data-pos="br"></span>
  </div>
</div>
```

**CSS:**

```css
.game-dice {
  width: 50px;
  height: 50px;
  background: white;
  border-radius: 8px;
  border: 2px solid #333;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  padding: 8px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.game-dice--sm {
  width: 35px;
  height: 35px;
  padding: 5px;
}
.game-dice--lg {
  width: 70px;
  height: 70px;
  padding: 12px;
}

.game-dice--kept {
  border-color: #4caf50;
  box-shadow: 0 0 10px #4caf50;
  transform: scale(1.1);
}

.game-dice--rolling {
  animation: dice-roll 0.3s infinite;
}

@keyframes dice-roll {
  0% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(10deg);
  }
  50% {
    transform: rotate(-10deg);
  }
  75% {
    transform: rotate(5deg);
  }
  100% {
    transform: rotate(0deg);
  }
}

.dice-dot {
  width: 8px;
  height: 8px;
  background: #333;
  border-radius: 50%;
  justify-self: center;
  align-self: center;
}

/* Dot positions */
.dice-dot[data-pos="tl"] {
  grid-area: 1/1;
}
.dice-dot[data-pos="tc"] {
  grid-area: 1/2;
}
.dice-dot[data-pos="tr"] {
  grid-area: 1/3;
}
.dice-dot[data-pos="ml"] {
  grid-area: 2/1;
}
.dice-dot[data-pos="mc"] {
  grid-area: 2/2;
}
.dice-dot[data-pos="mr"] {
  grid-area: 2/3;
}
.dice-dot[data-pos="bl"] {
  grid-area: 3/1;
}
.dice-dot[data-pos="bc"] {
  grid-area: 3/2;
}
.dice-dot[data-pos="br"] {
  grid-area: 3/3;
}

/* Hide dots based on value */
.game-dice[data-value="1"] .dice-dot {
  display: none;
}
.game-dice[data-value="1"] .dice-dot[data-pos="mc"] {
  display: block;
}

.game-dice[data-value="2"] .dice-dot {
  display: none;
}
.game-dice[data-value="2"] .dice-dot[data-pos="tr"],
.game-dice[data-value="2"] .dice-dot[data-pos="bl"] {
  display: block;
}

/* ... similar for 3-6 */
```

---

**ChipStack Component:**

```typescript
interface ChipStackProps {
  amount: number;
  denominations: number[];
  interactive?: boolean;
  onBetChange?: (amount: number,) => void;
}
```

**HTML Structure:**

```html
<div class="chip-stack" data-amount="500">
  <div class="chip chip--100"></div>
  <div class="chip chip--100"></div>
  <div class="chip chip--100"></div>
  <div class="chip chip--100"></div>
  <div class="chip chip--100"></div>
  <span class="chip-total">500</span>
</div>
```

**CSS:**

```css
.chip-stack {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  position: relative;
}

.chip {
  width: 40px;
  height: 12px;
  border-radius: 6px;
  border: 2px dashed;
  margin-top: -4px;
}

.chip--10 {
  background: white;
  border-color: #333;
}
.chip--25 {
  background: #4caf50;
  border-color: #2e7d32;
}
.chip--50 {
  background: #2196f3;
  border-color: #1565c0;
}
.chip--100 {
  background: #f44336;
  border-color: #c62828;
}
.chip--500 {
  background: #9c27b0;
  border-color: #6a1b9a;
}
.chip--1000 {
  background: #ff9800;
  border-color: #e65100;
}

.chip-total {
  font-size: 12px;
  font-weight: bold;
  margin-top: 8px;
}

.chip-stack--interactive .chip:hover {
  transform: translateY(-2px);
  cursor: pointer;
}
```

---

**BetSlider Component:**

```typescript
interface BetSliderProps {
  min: number;
  max: number;
  current: number;
  presets?: number[];
  onChange: (amount: number,) => void;
}
```

**HTML Structure:**

```html
<div class="bet-slider">
  <div class="bet-slider__presets">
    <button class="bet-preset" data-amount="10">10</button>
    <button class="bet-preset" data-amount="25">25</button>
    <button class="bet-preset" data-amount="50">50</button>
    <button class="bet-preset" data-amount="100">100</button>
    <button class="bet-preset bet-preset--all-in">All In</button>
  </div>
  <div class="bet-slider__track">
    <input type="range" min="10" max="1000" value="50" class="bet-slider__input">
    <div class="bet-slider__thumb"></div>
  </div>
  <div class="bet-slider__value">
    <span class="bet-amount">50</span>
    <span class="bet-currency">gold</span>
  </div>
</div>
```

**CSS:**

```css
.bet-slider {
  width: 100%;
  padding: 16px;
  background: #1a1a2e;
  border-radius: 8px;
}

.bet-slider__presets {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.bet-preset {
  flex: 1;
  padding: 8px;
  background: #2d2d44;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  cursor: pointer;
  transition: background 0.2s;
}

.bet-preset:hover {
  background: #3d3d54;
}

.bet-preset--active {
  background: #4caf50;
  border-color: #4caf50;
}

.bet-slider__track {
  position: relative;
  height: 20px;
  background: #333;
  border-radius: 10px;
}

.bet-slider__input {
  width: 100%;
  height: 100%;
  -webkit-appearance: none;
  background: transparent;
}

.bet-slider__input::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  background: #4caf50;
  border-radius: 50%;
  cursor: pointer;
  margin-top: -2px;
}

.bet-slider__value {
  text-align: center;
  margin-top: 12px;
  font-size: 24px;
  font-weight: bold;
  color: #ffd700;
}
```

---

**GameTimer Component:**

```typescript
interface GameTimerProps {
  duration: number; // seconds
  onTimeout: () => void;
  warningThreshold?: number; // seconds
}
```

**HTML Structure:**

```html
<div class="game-timer">
  <svg class="timer-ring" viewBox="0 0 100 100">
    <circle class="timer-ring__bg" cx="50" cy="50" r="45"></circle>
    <circle class="timer-ring__progress" cx="50" cy="50" r="45"></circle>
  </svg>
  <span class="timer-value">30</span>
</div>
```

**CSS:**

```css
.game-timer {
  position: relative;
  width: 80px;
  height: 80px;
}

.timer-ring {
  transform: rotate(-90deg);
}

.timer-ring__bg {
  fill: none;
  stroke: #333;
  stroke-width: 8;
}

.timer-ring__progress {
  fill: none;
  stroke: #4caf50;
  stroke-width: 8;
  stroke-dasharray: 283; /* 2πr */
  stroke-dashoffset: 0;
  transition: stroke-dashoffset 1s linear;
}

.game-timer--warning .timer-ring__progress {
  stroke: #ff9800;
}

.game-timer--critical .timer-ring__progress {
  stroke: #f44336;
  animation: timer-pulse 0.5s infinite;
}

@keyframes timer-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.timer-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 24px;
  font-weight: bold;
}
```

---

**GameLog Component:**

```typescript
interface GameLogProps {
  entries: LogEntry[];
  maxEntries?: number;
}

interface LogEntry {
  id: string;
  type: "info" | "action" | "win" | "lose" | "draw" | "system";
  message: string;
  timestamp: Date;
  playerId?: string;
}
```

**HTML Structure:**

```html
<div class="game-log">
  <div class="game-log__header">
    <span class="game-log__title">Game Log</span>
    <button class="game-log__toggle">▼</button>
  </div>
  <div class="game-log__entries">
    <div class="log-entry log-entry--info">
      <span class="log-entry__time">12:34</span>
      <span class="log-entry__message">Game started</span>
    </div>
    <div class="log-entry log-entry--action">
      <span class="log-entry__time">12:35</span>
      <span class="log-entry__player">You</span>
      <span class="log-entry__message">bet 50 gold</span>
    </div>
    <div class="log-entry log-entry--win">
      <span class="log-entry__time">12:36</span>
      <span class="log-entry__message">You won 100 gold!</span>
    </div>
  </div>
</div>
```

**CSS:**

```css
.game-log {
  background: #1a1a2e;
  border-radius: 8px;
  overflow: hidden;
}

.game-log__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #2d2d44;
}

.game-log__title {
  font-weight: bold;
  color: white;
}

.game-log__entries {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.log-entry {
  display: flex;
  align-items: center;
  padding: 8px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.log-entry--info {
  background: #2d2d44;
}
.log-entry--action {
  background: #1e3a5f;
}
.log-entry--win {
  background: #1b5e20;
}
.log-entry--lose {
  background: #b71c1c;
}
.log-entry--draw {
  background: #4a148c;
}
.log-entry--system {
  background: #333;
  font-style: italic;
}

.log-entry__time {
  color: #888;
  font-size: 12px;
  margin-right: 8px;
}

.log-entry__player {
  font-weight: bold;
  margin-right: 8px;
}

.log-entry__message {
  color: white;
}
```

---

**PlayerStatusBar Component:**

```typescript
interface PlayerStatusBarProps {
  player: {
    id: string;
    name: string;
    avatar?: string;
    chips: number;
    currentBet: number;
    isActive: boolean;
    isTurn: boolean;
  };
}
```

**HTML Structure:**

```html
<div class="player-status player-status--active player-status--turn">
  <img class="player-status__avatar" src="/avatars/player.jpg" alt="Player">
  <div class="player-status__info">
    <span class="player-status__name">Player 1</span>
    <div class="player-status__chips">
      <span class="chip-icon">◉</span>
      <span class="chip-amount">1,000</span>
    </div>
  </div>
  <div class="player-status__bet">Bet: 100</div>
  <div class="player-status__indicator"></div>
</div>
```

**CSS:**

```css
.player-status {
  display: flex;
  align-items: center;
  padding: 12px;
  background: #2d2d44;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.player-status--active {
  border-color: #4caf50;
}

.player-status--turn {
  background: #1e3a5f;
  animation: turn-pulse 1.5s infinite;
}

@keyframes turn-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(76, 175, 80, 0);
  }
}

.player-status__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  margin-right: 12px;
}

.player-status__name {
  font-weight: bold;
  color: white;
}

.player-status__chips {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #ffd700;
}

.player-status__bet {
  margin-left: auto;
  padding: 4px 8px;
  background: #4caf50;
  border-radius: 4px;
  color: white;
  font-weight: bold;
}

.player-status__indicator {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin-left: 8px;
}

.player-status--active .player-status__indicator {
  background: #4caf50;
}

.player-status--folded .player-status__indicator {
  background: #f44336;
}
```

---

**HandEvaluator Component:**

```typescript
interface HandEvaluatorProps {
  cards: Card[];
  showRank?: boolean;
  showValue?: boolean;
}
```

**HTML Structure:**

```html
<div class="hand-evaluator">
  <div class="hand-evaluator__cards">
    <div class="game-card">...</div>
    <div class="game-card">...</div>
    <div class="game-card">...</div>
  </div>
  <div class="hand-evaluator__info">
    <span class="hand-rank">Full House</span>
    <span class="hand-value">Kings full of Queens</span>
  </div>
</div>
```

**CSS:**

```css
.hand-evaluator {
  text-align: center;
}

.hand-evaluator__cards {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;
}

.hand-evaluator__info {
  padding: 8px 16px;
  background: #4caf50;
  border-radius: 4px;
}

.hand-rank {
  font-size: 18px;
  font-weight: bold;
  color: white;
}

.hand-value {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}
```

---

## Layout Components

**Single Player Layout:**

```html
<div class="game-layout game-layout--single">
  <header class="game-header">
    <h2 class="game-title">Blackjack</h2>
    <div class="game-timer">...</div>
  </header>

  <main class="game-main">
    <div class="game-dealer">
      <h3>Dealer</h3>
      <div class="hand-evaluator">...</div>
    </div>

    <div class="game-status">
      <span class="status-message">Your turn</span>
    </div>

    <div class="game-player">
      <div class="hand-evaluator">...</div>
      <div class="player-status">...</div>
    </div>
  </main>

  <footer class="game-controls">
    <div class="bet-slider">...</div>
    <div class="game-actions">
      <button class="game-btn game-btn--hit">Hit</button>
      <button class="game-btn game-btn--stand">Stand</button>
      <button class="game-btn game-btn--double">Double</button>
    </div>
  </footer>
</div>
```

**Multiplayer Layout:**

```html
<div class="game-layout game-layout--multi">
  <header class="game-header">
    <h2 class="game-title">Poker</h2>
    <div class="game-timer">...</div>
    <div class="pot-display">Pot: 500</div>
  </header>

  <main class="game-table">
    <div class="game-players">
      <div class="player-status player-status--seat-1">...</div>
      <div class="player-status player-status--seat-2">...</div>
      <div class="player-status player-status--seat-3">...</div>
    </div>

    <div class="game-community">
      <div class="hand-evaluator">...</div>
    </div>

    <div class="game-pot">
      <span class="pot-amount">500</span>
    </div>
  </main>

  <footer class="game-controls">
    <div class="bet-slider">...</div>
    <div class="game-actions">
      <button class="game-btn game-btn--fold">Fold</button>
      <button class="game-btn game-btn--check">Check</button>
      <button class="game-btn game-btn--call">Call</button>
      <button class="game-btn game-btn--raise">Raise</button>
    </div>
  </footer>
</div>
```

**Compact Mobile Layout:**

```html
<div class="game-layout game-layout--mobile">
  <div class="game-header game-header--compact">
    <span class="game-title">Dice Duel</span>
    <div class="game-timer game-timer--sm">...</div>
  </div>

  <div class="game-main game-main--stacked">
    <div class="player-status player-status--top">
      <div class="player-status__info">
        <span class="player-status__name">Opponent</span>
        <span class="player-status__score">2 wins</span>
      </div>
      <div class="game-dice game-dice--sm">...</div>
    </div>

    <div class="game-center">
      <span class="vs-text">VS</span>
      <span class="round-info">Round 2/3</span>
    </div>

    <div class="player-status player-status--bottom">
      <div class="game-dice game-dice--sm">...</div>
      <div class="player-status__info">
        <span class="player-status__name">You</span>
        <span class="player-status__score">1 win</span>
      </div>
    </div>
  </div>

  <div class="game-controls game-controls--bottom">
    <div class="game-actions game-actions--full">
      <button class="game-btn game-btn--roll">Roll Dice</button>
    </div>
  </div>
</div>
```

**CSS for Layouts:**

```css
.game-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #0d1117;
  color: white;
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #161b22;
}

.game-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 16px;
}

.game-controls {
  padding: 16px;
  background: #161b22;
}

.game-layout--single .game-main {
  justify-content: space-between;
}

.game-layout--multi .game-table {
  position: relative;
  width: 100%;
  max-width: 800px;
  margin: 0 auto;
}

.game-layout--mobile .game-main--stacked {
  gap: 16px;
}

.game-controls--bottom {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .game-header--compact {
    padding: 8px;
  }

  .game-btn {
    padding: 12px 24px;
    font-size: 14px;
  }

  .bet-slider__presets {
    flex-wrap: wrap;
  }

  .bet-preset {
    min-width: calc(50% - 4px);
  }
}
```

---

## API Contracts

### Game Management

**Create Game:**

```
POST /api/games
```

Request:

```typescript
interface CreateGameRequest {
  gameType:
    | "rps"
    | "higherLower"
    | "yahtzee"
    | "coinFlip"
    | "cardDraw"
    | "diceDuel"
    | "cardBattle"
    | "blackjack"
    | "trivia"
    | "wheel"
    | "bingo";
  betAmount: number;
  opponentId?: string; // null for NPC
  options?: {
    bestOf?: number; // RPS: 1, 3, 5
    diceType?: "d6" | "d8" | "d10" | "d12" | "d20"; // Higher/Lower
    category?: string; // Trivia
    wheelType?: string; // Wheel of Fortune
    bingoPattern?: "line" | "two_lines" | "full_card"; // Bingo
  };
}
```

Response:

```typescript
interface CreateGameResponse {
  gameId: string;
  status: "waiting" | "active";
  player: {
    id: string;
    chips: number;
    currentBet: number;
  };
  opponent?: {
    id: string;
    name: string;
    avatar: string;
    isNPC: boolean;
  };
  gameState: any; // Game-specific state
}
```

**Get Game:**

```
GET /api/games/:gameId
```

Response:

```typescript
interface GetGameResponse {
  gameId: string;
  gameType: string;
  status: "waiting" | "active" | "finished";
  players: PlayerState[];
  gameState: any;
  history: GameEvent[];
}
```

**Join Game:**

```
POST /api/games/:gameId/join
```

Request:

```typescript
interface JoinGameRequest {
  playerId: string;
  betAmount: number;
}
```

Response:

```typescript
interface JoinGameResponse {
  success: boolean;
  gameState: any;
  error?: string;
}
```

**Make Move:**

```
POST /api/games/:gameId/move
```

Request:

```typescript
interface MakeMoveRequest {
  playerId: string;
  action: string; // Game-specific
  data?: any; // Game-specific
}
```

Examples by game:

```typescript
// RPS
{ action: 'choose', hand: 'rock' | 'paper' | 'scissors' }

// Higher/Lower
{ action: 'choose', choice: 'higher' | 'lower' }
{ action: 'doubleDown' }

// Yahtzee
{ action: 'roll', keepDice: boolean[] }
{ action: 'score', category: string }

// Coin Flip
{ action: 'choose', side: 'heads' | 'tails' }

// Card Draw
{ action: 'choose', choice: 'higher' | 'lower' | 'suit', suit?: string }

// Dice Duel
{ action: 'roll' }
{ action: 'reroll', keepDice: boolean[] }

// Card Battle
{ action: 'fold' }
{ action: 'check' }
{ action: 'call' }
{ action: 'raise', amount: number }
{ action: 'allIn' }

// Blackjack
{ action: 'hit' }
{ action: 'stand' }
{ action: 'double' }
{ action: 'split' }

// Trivia
{ action: 'answer', questionIndex: number, answer: string | number }

// Wheel
{ action: 'spin' }

// Bingo
{ action: 'daub', row: number, col: number }
{ action: 'bingo' }
```

Response:

```typescript
interface MakeMoveResponse {
  success: boolean;
  gameState: any;
  result?: {
    winner?: string;
    payout?: number;
    message?: string;
  };
  error?: string;
}
```

**Leave Game:**

```
POST /api/games/:gameId/leave
```

Request:

```typescript
interface LeaveGameRequest {
  playerId: string;
  reason?: string;
}
```

Response:

```typescript
interface LeaveGameResponse {
  success: boolean;
  refund: number;
  penalty?: number;
}
```

---

### Tournament Management

**Create Tournament:**

```
POST /api/tournaments
```

Request:

```typescript
interface CreateTournamentRequest {
  name: string;
  gameType: string;
  format: "single_elimination" | "double_elimination" | "round_robin" | "swiss";
  maxPlayers: number;
  entryFee: number;
  prizePool: number;
  startTime: Date;
  options?: {
    bestOf?: number;
    timePerRound?: number;
  };
}
```

Response:

```typescript
interface CreateTournamentResponse {
  tournamentId: string;
  status: "pending" | "registration" | "active" | "finished";
  players: PlayerState[];
  brackets: Bracket[];
}
```

**Join Tournament:**

```
POST /api/tournaments/:tournamentId/join
```

Request:

```typescript
interface JoinTournamentRequest {
  playerId: string;
}
```

Response:

```typescript
interface JoinTournamentResponse {
  success: boolean;
  position: number;
  totalPlayers: number;
  error?: string;
}
```

**Get Tournament:**

```
GET /api/tournaments/:tournamentId
```

Response:

```typescript
interface GetTournamentResponse {
  tournamentId: string;
  name: string;
  status: string;
  players: PlayerState[];
  brackets: Bracket[];
  currentRound: number;
  totalRounds: number;
  matches: MatchState[];
}
```

**Make Tournament Move:**

```
POST /api/tournaments/:tournamentId/match/:matchId/move
```

Request/Response same as regular game move.

---

### Player Stats

**Get Player Stats:**

```
GET /api/players/:playerId/stats
```

Response:

```typescript
interface PlayerStatsResponse {
  playerId: string;
  stats: {
    totalGamesPlayed: number;
    totalGamesWon: number;
    winRate: number;
    favoriteGame: string;

    // Per-Game
    rps: { played: number; won: number; streak: number };
    higherLower: { played: number; won: number; streak: number };
    yahtzee: { played: number; won: number; bestScore: number };
    // ... etc

    // Social
    tournamentsPlayed: number;
    tournamentsWon: number;
    achievementsEarned: number;

    // Economy
    totalGoldEarned: number;
    totalGoldLost: number;
    netProfit: number;

    // Ranking
    elo: number;
    rank: string;
  };
  achievements: Achievement[];
  recentGames: GameSummary[];
}
```

**Get Leaderboard:**

```
GET /api/leaderboard
```

Query params:

```typescript
interface LeaderboardQuery {
  type: "daily" | "weekly" | "all_time";
  stat: "wins" | "earnings" | "elo" | "achievements";
  limit?: number;
  offset?: number;
}
```

Response:

```typescript
interface LeaderboardResponse {
  type: string;
  stat: string;
  entries: {
    rank: number;
    playerId: string;
    playerName: string;
    avatar: string;
    value: number;
  }[];
  playerRank?: {
    rank: number;
    value: number;
  };
}
```

---

### Achievements

**Get Player Achievements:**

```
GET /api/players/:playerId/achievements
```

Response:

```typescript
interface PlayerAchievementsResponse {
  earned: Achievement[];
  progress: AchievementProgress[];
  locked: Achievement[];
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: "card" | "dice" | "luck" | "social" | "meta";
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  points: number;
  earnedAt: Date;
}

interface AchievementProgress {
  id: string;
  name: string;
  description: string;
  progress: number;
  maxProgress: number;
  percentage: number;
}
```

**Claim Achievement:**

```
POST /api/achievements/:achievementId/claim
```

Response:

```typescript
interface ClaimAchievementResponse {
  success: boolean;
  reward: {
    type: "gold" | "token" | "cosmetic";
    amount: number;
  };
  message: string;
}
```

---

### Social

**Get Friends:**

```
GET /api/players/:playerId/friends
```

Response:

```typescript
interface FriendsResponse {
  friends: {
    id: string;
    name: string;
    avatar: string;
    online: boolean;
    currentlyPlaying?: {
      gameType: string;
      gameId: string;
    };
  }[];
  pending: {
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  };
}
```

**Invite to Game:**

```
POST /api/social/invite
```

Request:

```typescript
interface InviteToGameRequest {
  friendId: string;
  gameId?: string; // Existing game to join
  gameType?: string; // New game to create
  betAmount?: number;
}
```

Response:

```typescript
interface InviteToGameResponse {
  success: boolean;
  inviteId: string;
  message: string;
}
```

**Spectate Game:**

```
POST /api/social/spectate
```

Request:

```typescript
interface SpectateGameRequest {
  gameId: string;
}
```

Response:

```typescript
interface SpectateGameResponse {
  success: boolean;
  gameState: any;
  players: PlayerState[];
}
```

**Send Gift:**

```
POST /api/social/gift
```

Request:

```typescript
interface SendGiftRequest {
  recipientId: string;
  giftType: "gold" | "token" | "item";
  amount: number;
  message?: string;
}
```

Response:

```typescript
interface SendGiftResponse {
  success: boolean;
  remainingBalance: number;
  message: string;
}
```

---

### Chat Commands

**Send Game Chat:**

```
POST /api/games/:gameId/chat
```

Request:

```typescript
interface GameChatMessage {
  message: string;
  type: "message" | "emote" | "system";
}
```

Response:

```typescript
interface GameChatResponse {
  success: boolean;
  message: {
    id: string;
    sender: string;
    message: string;
    timestamp: Date;
  };
}
```

**Get Game Chat History:**

```
GET /api/games/:gameId/chat
```

Query params:

```typescript
interface ChatHistoryQuery {
  limit?: number;
  before?: string; // message ID for pagination
}
```

Response:

```typescript
interface ChatHistoryResponse {
  messages: {
    id: string;
    sender: string;
    senderName: string;
    message: string;
    type: string;
    timestamp: Date;
  }[];
  hasMore: boolean;
}
```

---

### Anti-Exploit

**Get Rate Limits:**

```
GET /api/games/rate-limits
```

Response:

```typescript
interface RateLimitsResponse {
  gamesPerHour: { current: number; limit: number };
  betsPerHour: { current: number; limit: number };
  tournamentsPerDay: { current: number; limit: number };
  cooldowns: {
    lastGame: Date;
    canPlayAt: Date;
  };
}
```

**Report Suspicious Activity:**

```
POST /api/games/report
```

Request:

```typescript
interface ReportSuspiciousRequest {
  gameId: string;
  reason: "collusion" | "botting" | "exploit" | "other";
  details: string;
  evidence?: string[];
}
```

Response:

```typescript
interface ReportSuspiciousResponse {
  success: boolean;
  reportId: string;
  message: string;
}
```

---

## WebSocket Events (Real-time)

### Connection

```typescript
// Connect to game
const ws = new WebSocket(`wss://api.example.com/games/${gameId}`,);

// Authenticate
ws.send(JSON.stringify({
  type: "auth",
  token: playerToken,
},),);
```

### Client → Server Events

```typescript
// Join game
ws.send(JSON.stringify({
  type: "join",
  gameId: "uuid",
},),);

// Make move
ws.send(JSON.stringify({
  type: "move",
  action: "hit",
  data: {},
},),);

// Chat
ws.send(JSON.stringify({
  type: "chat",
  message: "Good luck!",
},),);

// Heartbeat
ws.send(JSON.stringify({
  type: "ping",
},),);
```

### Server → Client Events

```typescript
// Game state update
{
  type: 'state',
  gameState: {...}
}

// Player joined
{
  type: 'player_joined',
  player: { id, name, avatar }
}

// Player left
{
  type: 'player_left',
  playerId: 'uuid',
  reason: 'disconnect'
}

// Game started
{
  type: 'game_started',
  gameState: {...}
}

// Move made
{
  type: 'move_made',
  playerId: 'uuid',
  action: 'hit',
  gameState: {...}
}

// Game ended
{
  type: 'game_ended',
  results: {
    winner: 'uuid',
    payouts: [...],
    achievements: [...]
  }
}

// Chat message
{
  type: 'chat',
  sender: 'uuid',
  message: 'string',
  timestamp: 'iso'
}

// Error
{
  type: 'error',
  code: 'INSUFFICIENT_FUNDS',
  message: 'Not enough gold'
}
```

---

## Error Codes

```typescript
enum GameErrorCode {
  // Game State
  GAME_NOT_FOUND = "GAME_NOT_FOUND",
  GAME_ALREADY_STARTED = "GAME_ALREADY_STARTED",
  GAME_ALREADY_FINISHED = "GAME_ALREADY_FINISHED",
  INVALID_MOVE = "INVALID_MOVE",
  NOT_YOUR_TURN = "NOT_YOUR_TURN",

  // Player
  PLAYER_NOT_IN_GAME = "PLAYER_NOT_IN_GAME",
  PLAYER_ALREADY_IN_GAME = "PLAYER_ALREADY_IN_GAME",
  PLAYER_DISCONNECTED = "PLAYER_DISCONNECTED",

  // Economy
  INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
  BET_EXCEEDS_LIMIT = "BET_EXCEEDS_LIMIT",
  BET_BELOW_MINIMUM = "BET_BELOW_MINIMUM",

  // Rate Limiting
  TOO_MANY_GAMES = "TOO_MANY_GAMES",
  COOLDOWN_ACTIVE = "COOLDOWN_ACTIVE",
  DAILY_LIMIT_REACHED = "DAILY_LIMIT_REACHED",

  // Tournament
  TOURNAMENT_FULL = "TOURNAMENT_FULL",
  TOURNAMENT_NOT_STARTED = "TOURNAMENT_NOT_STARTED",
  TOURNAMENT_ALREADY_STARTED = "TOURNAMENT_ALREADY_STARTED",

  // Social
  FRIEND_NOT_FOUND = "FRIEND_NOT_FOUND",
  FRIEND_REQUEST_PENDING = "FRIEND_REQUEST_PENDING",
  ALREADY_SPECTATING = "ALREADY_SPECTATING",

  // System
  SERVER_ERROR = "SERVER_ERROR",
  INVALID_REQUEST = "INVALID_REQUEST",
  UNAUTHORIZED = "UNAUTHORIZED",
}
```

---

## Next Steps

1. **Finalize UI Component Library** — Create Figma designs
2. **API Documentation** — OpenAPI/Swagger specs
3. **WebSocket Protocol** — Detailed event documentation
4. **Error Handling** — Client-side error handling patterns
5. **Testing** — API test cases
6. **Implementation** — Start with Phase 1 games
