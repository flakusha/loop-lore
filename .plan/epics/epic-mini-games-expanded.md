<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Mini-Games: Expanded Design — UI/UX, Flow, & Deep Mechanics

**Status:** Draft
**Parent:** Epic: Mini-Games & Interactive Mechanics
**Extends:** `epic-mini-games-design.md`

---

## Table of Contents

1. [UI Component Library](#ui-component-library)
2. [Chat Flow Diagrams](#chat-flow-diagrams)
3. [VN Integration Patterns](#vn-integration-patterns)
4. [Battle Integration Patterns](#battle-integration-patterns)
5. [NPC AI Deep Dive](#npc-ai-deep-dive)
6. [Economy Formulas](#economy-formulas)
7. [Achievement & Progression](#achievement--progression)
8. [Tournament System](#tournament-system)
9. [Custom Card Game Builder](#custom-card-game-builder)
10. [Responsive & Accessibility](#responsive--accessibility)
11. [Sound & Visual Feedback](#sound--visual-feedback)
12. [Error Handling & Edge Cases](#error-handling--edge-cases)
13. [Multiplayer Considerations](#multiplayer-considerations)

---

## UI Component Library

### Reusable Components

#### Card Component

```
┌─────────────────┐
│ ♠               │
│                 │
│       A         │
│                 │
│               ♠ │
└─────────────────┘

Props:
  suit: "hearts" | "diamonds" | "clubs" | "spades"
  rank: "2"-"10" | "J" | "Q" | "K" | "A"
  faceUp: boolean
  selected: boolean
  onClick?: () => void
  size: "sm" | "md" | "lg"
  animation?: "deal" | "flip" | "discard"
```

**Visual Variants:**

```
Standard:    [♠A] [♥K] [♦Q] [♣J]
Unicode:     🂡 🂮 🃊 🃇
Text-only:   A♠ K♥ Q♦ J♣
Compact:     A♠ (for mobile)
```

#### Dice Component

```
    ┌─────┐
    │ ● ● │
    │     │
    │ ● ● │
    └─────┘

Props:
  value: 1-6
  rolling: boolean
  kept: boolean
  onClick?: () => void
  size: "sm" | "md" | "lg"
  animation?: "roll" | "keep"
```

**Dice States:**

```
Normal:    [🎲5]     — clickable
Kept:      [🎲5] ✓   — locked, won't reroll
Rolling:   [🎲?]     — animation playing
Ghost:     [🎲?]     — about to be rerolled
```

#### Chip Stack Component

```
  ●●●●●○○○○○ (75g)
  ┌─────────────────────────────────┐
  │ ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░ │
  └─────────────────────────────────┘

Props:
  amount: number
  maxAmount: number
  color: "red" | "blue" | "green" | "black" | "gold"
  animated: boolean
  showLabel: boolean
```

**Chip Denominations:**

```
●  = 1g    (copper)
●● = 5g    (bronze)
●●● = 25g  (silver)
●●●● = 100g (gold)
●●●●● = 500g (platinum)
```

#### Hand evaluator

```
Full House, Kings over Aces
皇家同花顺 (Royal Flush)
Two Pair, Aces and Eights

Props:
  cards: Card[]
  showRating: boolean
  highlightBest: boolean
```

#### Bet Slider

```
Bet: 50g
[────●────────────────] 
   10g              500g

[−10] [−5] [−1] [Bet: 50g] [+1] [+5] [+10] [All-In]
```

#### Timer Component

```
Time: ████████░░ 8s
Time: ██████░░░░ 6s
Time: ████░░░░░░ 4s
Time: ██░░░░░░░░ 2s
Time: ░░░░░░░░░░ 0s (timeout!)
```

#### Game Log

```
┌─ Game Log ────────────────────────────────┐
│ Round 1: You bet 25g, Elena calls         │
│ Round 1: Grak raises to 50g               │
│ Round 1: You fold                         │
│ Round 2: Elena wins pot (125g)            │
│ Round 3: Grak bluffs, you call            │
│ Round 3: You win pot (200g)               │
└───────────────────────────────────────────┘
```

#### Player Status Bar

```
┌─────────────────────────────────────────────┐
│ 👤 You (75g)  │  🤖 Elena (120g)  │ 🤖 Grak (80g) │
│ ████████████  │  ██████████████   │ ██████████    │
│ Active        │  Waiting          │ Waiting       │
└─────────────────────────────────────────────┘
```

### Layout Patterns

#### Single Player Layout

```
┌─────────────────────────────────────────────┐
│  GAME TITLE                    Streak: 3    │
├─────────────────────────────────────────────┤
│                                             │
│           [Game Area]                       │
│         (cards, dice, wheel)                │
│                                             │
├─────────────────────────────────────────────┤
│  [Action Buttons]                           │
│  [Hit] [Stand] [Double] [Surrender]        │
├─────────────────────────────────────────────┤
│  Pot: 100g │ Balance: 250g │ Round: 3/5    │
└─────────────────────────────────────────────┘
```

#### Multiplayer Layout

```
┌─────────────────────────────────────────────┐
│  POKER - 5-Card Draw         Pot: 275 gold │
├─────────────────────────────────────────────┤
│  [Opponent 1]  [Opponent 2]  [Opponent 3]  │
│  🤖 Elena      🤖 Grak       🤖 Mira       │
│  Bet: 50g      Bet: 25g      Bet: 100g     │
│  Cards: ????   Cards: ????   Cards: ????   │
├─────────────────────────────────────────────┤
│  ┌─ Your Hand ────────────────────────────┐ │
│  │ [♠K] [♥K] [♦K] [♣A] [♠9]             │ │
│  └────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│  [Check] [Bet 50] [Raise 100] [Fold]       │
├─────────────────────────────────────────────┤
│  Chat: "Elena adjusts her collar."         │
│  Chat: "Grak grins confidently."           │
└─────────────────────────────────────────────┘
```

#### Compact Mobile Layout

```
┌─────────────────┐
│ POKER    275g   │
├─────────────────┤
│ E:??? G:??? M:???│
│ Bet: 50 25 100  │
├─────────────────┤
│ [♠K][♥K][♦K]   │
│ [♣A][♠9]        │
├─────────────────┤
│ [Check][Bet]    │
│ [Raise][Fold]   │
├─────────────────┤
│ Elena adjusts...│
└─────────────────┘
```

---

## Chat Flow Diagrams

### Flow 1: Player-Initiated Game

```
Player                    System                   NPC
  │                         │                       │
  │  /play blackjack        │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │  Create session         │                       │
  │  Render game UI         │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  [Hit]                  │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │  Process action         │                       │
  │  Update state           │                       │
  │  Render new card        │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  [Stand]                │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │  Dealer plays           │                       │
  │  Calculate result       │                       │
  │  Apply effects          │                       │
  │  Show summary           │                       │
  │<────────────────────────│                       │
```

### Flow 2: NPC-Initiated Game

```
Player                    System                   NPC
  │                         │                       │
  │                         │  NPC: "Fancy a game?" │
  │<────────────────────────────────────────────────│
  │                         │                       │
  │  [Accept]               │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │                         │  Create session       │
  │                         │  Render game UI       │
  │<────────────────────────│                       │
  │                         │                       │
  │  Game plays...          │                       │
  │                         │                       │
  │                         │  Game ends            │
  │                         │  NPC reacts           │
  │<────────────────────────────────────────────────│
  │                         │                       │
  │  NPC: "Well played!"    │                       │
```

### Flow 3: VN Scene Game

```
Story                     System                   Game
  │                         │                       │
  │  Scene: tavern_poker    │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │                         │  Create game session  │
  │                         │  Overlay game UI      │
  │<────────────────────────│                       │
  │                         │                       │
  │  Game plays...          │                       │
  │                         │                       │
  │  Game ends              │                       │
  │  Apply story effects    │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  Branch based on result │                       │
  │  Continue story         │                       │
```

### Flow 4: Battle Game

```
Battle                   System                   Game
  │                         │                       │
  │  Player chooses "Game"  │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │                         │  Pause battle         │
  │                         │  Start dice duel      │
  │<────────────────────────│                       │
  │                         │                       │
  │  Dice duel plays...     │                       │
  │                         │                       │
  │  Duel ends              │                       │
  │  Calculate damage       │                       │
  │  Resume battle          │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  Continue battle        │                       │
```

### Flow 5: Tournament

```
Player                    System                   Players
  │                         │                       │
  │  /tournament join poker │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │  Added to queue         │                       │
  │  Waiting for players... │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  Tournament starts!     │                       │
  │  Round 1: You vs Elena  │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  Round 1 ends           │                       │
  │  Round 2: You vs Grak   │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  ...                    │                       │
  │                         │                       │
  │  Final results          │                       │
  │  Prizes awarded         │                       │
  │<────────────────────────│                       │
```

---

## VN Integration Patterns

### Pattern 1: Gambling Den Scene

```typescript
const gamblingDenScene: VNScene = {
  id: "gambling_den",
  type: "composite",
  background: "tavern_backroom",
  music: "tension_strings",
  ambience: "chatter_glasses",

  characters: [
    { id: "dealer", name: "The Dealer", position: "center", mood: "neutral", },
    { id: "elena", name: "Elena", position: "left", mood: "curious", },
    { id: "grak", name: "Grak", position: "right", mood: "aggressive", },
  ],

  phases: [
    // Phase 1: Introduction
    {
      type: "dialogue",
      lines: [
        { speaker: "dealer", text: "Welcome to the Shadow Den. What'll it be?", },
        { speaker: "elena", text: "I suggest poker. Unless you're afraid?", },
        { speaker: "grak", text: "I'll take anyone on. Even the newcomer.", },
      ],
    },

    // Phase 2: Game choice
    {
      type: "choice",
      prompt: "What game do you choose?",
      options: [
        {
          text: "Poker",
          game: "poker",
          participants: ["player", "elena", "grak", "dealer",],
          stakes: { gold: 200, reputation: 10, },
          onSuccess: { nextPhase: "poker_win", },
          onFailure: { nextPhase: "poker_lose", },
        },
        {
          text: "Blackjack",
          game: "blackjack",
          participants: ["player", "dealer",],
          stakes: { gold: 100, },
          onSuccess: { nextPhase: "blackjack_win", },
          onFailure: { nextPhase: "blackjack_lose", },
        },
        {
          text: "Just drinks",
          nextPhase: "just_drinks",
        },
      ],
    },

    // Phase 3: Game plays (auto-handled by game system)
    // Phase 4: Outcomes
    {
      id: "poker_win",
      type: "dialogue",
      lines: [
        { speaker: "grak", text: "Lucky beginner.", mood: "angry", },
        { speaker: "elena", text: "Impressive. You have a gift.", mood: "impressed", },
        { speaker: "dealer", text: "The house always wins... eventually.", },
      ],
      effects: [
        { type: "intimacy", target: "elena", amount: 5, },
        { type: "reputation", target: "player", amount: 10, },
        { type: "relationship", target: "grak", amount: -5, },
      ],
    },

    {
      id: "poker_lose",
      type: "dialogue",
      lines: [
        { speaker: "grak", text: "Ha! Easy money.", mood: "happy", },
        { speaker: "elena", text: "Don't worry. You'll learn.", mood: "sympathetic", },
      ],
      effects: [
        { type: "reputation", target: "player", amount: -5, },
        { type: "intimacy", target: "elena", amount: 2, },
      ],
    },
  ],
};
```

### Pattern 2: Tournament Arc

```typescript
const tournamentArc: VNScene = {
  id: "poker_tournament",
  type: "tournament",
  game: "poker",
  rounds: 3,
  participants: ["player", "elena", "grak", "mira", "dealer", "stranger1",],

  structure: {
    round1: { players: 6, elimination: 2, },
    round2: { players: 4, elimination: 1, },
    final: { players: 3, elimination: 1, },
  },

  rewards: {
    first: { gold: 1000, item: "golden_cards", reputation: 50, },
    second: { gold: 500, reputation: 25, },
    third: { gold: 200, reputation: 10, },
  },

  storyBeats: {
    beforeRound1: "The tournament begins. Six players, one winner.",
    beforeRound2: "The weak have been eliminated. Four remain.",
    beforeFinal: "The final three. Only one will claim the prize.",
    afterFinal: "The crowd cheers for the champion!",
  },
};
```

### Pattern 3: NPC Relationship Game

```typescript
const relationshipGame: VNScene = {
  id: "truth_or_dare_campfire",
  type: "game",
  game: "truth_or_dare",
  context: "campfire_night",
  participants: ["player", "elena", "mira",],

  // Game affects relationships
  effects: {
    truthCorrect: { intimacy: 5, mood: "happy", },
    truthLie: { intimacy: -10, mood: "suspicious", },
    dareSuccess: { intimacy: 3, mood: "excited", reputation: 5, },
    dareFail: { intimacy: -5, mood: "embarrassed", reputation: -5, },
    pass: { intimacy: -3, mood: "disappointed", },
  },

  // Story branches based on total intimacy
  outcomes: {
    highIntimacy: {
      threshold: 30,
      nextScene: "romantic_moment",
      dialogue: "Elena looks at you differently tonight.",
    },
    mediumIntimacy: {
      threshold: 15,
      nextScene: "friendship_deeper",
      dialogue: "You've become closer friends.",
    },
    lowIntimacy: {
      threshold: 0,
      nextScene: "awkward_silence",
      dialogue: "The fire crackles in uncomfortable silence.",
    },
  },
};
```

### Pattern 4: Tutorial Game

```typescript
const tutorialGame: VNScene = {
  id: "tutorial_poker",
  type: "tutorial",
  game: "poker",
  tutor: "old_gambler",

  phases: [
    {
      instruction: "First, let me teach you the basics. Poker is about making the best hand.",
      showHand: ["♠2", "♥5", "♦9", "♣K", "♠A",],
      highlight: "high_card",
    },
    {
      instruction: "This is a High Card — not great. But watch what happens when we add a pair.",
      showHand: ["♠2", "♥2", "♦9", "♣K", "♠A",],
      highlight: "pair",
    },
    {
      instruction: "Two of the same rank — a Pair! That beats High Card.",
    },
    {
      instruction: "Now try it yourself. Which cards should you keep?",
      interactive: true,
      game: "poker_draw",
      helpText: "Keep the pair of 2s, discard the rest.",
    },
  ],
};
```

---

## Battle Integration Patterns

### Pattern 1: Dice Duel as Attack

```typescript
// Replace normal attack with dice duel
const diceDuelAttack: BattleAction = {
  type: "game_attack",
  game: "dice_duel",
  description: "Challenge to a dice duel!",

  // Battle integration
  onWin: {
    damage: "margin * 2", // Roll difference × 2
    effects: ["intimidate",],
  },
  onLose: {
    damage: "margin", // Roll difference
    effects: ["embarrassed",],
  },
  onDraw: {
    damage: 0,
    effects: ["determined",],
  },

  // UI
  ui: {
    type: "inline", // Show dice duel in battle panel
    position: "center",
    showHP: true,
  },
};
```

### Pattern 2: Gambling for Loot

```typescript
// Gamble to multiply loot
const gambleLoot: BattleAction = {
  type: "gamble_loot",
  game: "higher_lower",
  description: "Double or nothing on your loot?",

  trigger: "after_victory", // Only after winning battle

  loot: {
    base: "battle_rewards",
    multiplier: "game_result",
    maxMultiplier: 4,
  },

  risk: {
    loseAll: true, // Lose loot if game fails
    alternative: "keep_half", // Option to play safe
  },
};
```

### Pattern 3: Social Battle (Poker)

```typescript
// Poker as social combat
const pokerBattle: BattleAction = {
  type: "social_battle",
  game: "poker",
  description: "Outwit your opponent at the poker table!",

  // Stats affect gameplay
  statBonuses: {
    charisma: "bluff effectiveness",
    wisdom: "tell detection",
    intelligence: "odds calculation",
  },

  // Victory conditions
  victoryConditions: [
    { type: "chips", amount: "opponent_starting * 2", },
    { type: "opponent_fold", count: 3, },
    { type: "opponent_bankrupt", },
  ],

  // Failure conditions
  failureConditions: [
    { type: "player_bankrupt", },
    { type: "time_limit", seconds: 300, },
  ],

  // Rewards
  rewards: {
    victory: { gold: "pot", reputation: 20, xp: 50, },
    defeat: { gold: 0, reputation: -10, },
  },
};
```

### Pattern 4: Skill Check Game

```typescript
// Game as skill check
const skillCheckGame: BattleAction = {
  type: "skill_check",
  game: "trivia",
  description: "Answer correctly to cast your spell!",

  // Skill check mechanics
  difficulty: "based_on_spell_level",
  successThreshold: "70%", // Need 70% correct answers

  // Effects based on performance
  outcomes: {
    perfect: { spellPower: 1.5, description: "Perfect incantation!", },
    success: { spellPower: 1.0, description: "Spell cast successfully.", },
    partial: { spellPower: 0.5, description: "Spell weakened...", },
    failure: { spellPower: 0, description: "Spell failed!", },
  },
};
```

### Pattern 5: Camp Mini-Games

```typescript
// Mini-games during rest/camp
const campGames: CampActivity = {
  type: "mini_game",
  availableGames: ["dice", "cards", "trivia", "truth_or_dare",],
  context: "campfire",

  // Camp-specific rules
  rules: {
    timeLimit: "until_rest", // Can play until next rest
    stakes: "low", // Low stakes only
    effects: {
      play: { morale: 5, }, // Playing boosts morale
      win: { morale: 10, fatigue: -5, },
      lose: { morale: -5, },
      social: { relationship: 3, },
    },
  },

  // Party members can join
  partyJoin: {
    chance: "based_on_personality",
    responses: {
      happy: "I'm in!",
      tired: "Maybe later...",
      competitive: "You're on!",
    },
  },
};
```

---

## NPC AI Deep Dive

### Personality Matrix

```typescript
interface NPCPersonality {
  // Core traits (0-100)
  traits: {
    aggression: number; // How much they bet/raise
    patience: number; // How long they wait for good hands
    riskTolerance: number; // Willingness to bluff/gamble
    skill: number; // Optimal play vs mistakes
    sociability: number; // How much they chat/interact
    honesty: number; // Likelihood of cheating
  };

  // Play style
  style: "tight_aggressive" | "loose_passive" | "loose_aggressive" | "tight_passive" | "maniac" | "rock";

  // Tells (detectable)
  tells: {
    strongHand: string[]; // Behaviors when holding strong hand
    weakHand: string[]; // Behaviors when holding weak hand
    bluffing: string[]; // Behaviors when bluffing
    nervous: string[]; // Behaviors when nervous
  };

  // Reactions
  reactions: {
    win: string[]; // What they say/do when winning
    lose: string[]; // What they say/do when losing
    bigWin: string[]; // Reaction to big win
    bigLose: string[]; // Reaction to big loss
    caughtCheating: string[]; // Reaction to being caught
  };
}

// Example NPCs
const personalities: Record<string, NPCPersonality> = {
  elena: {
    traits: {
      aggression: 60,
      patience: 70,
      riskTolerance: 50,
      skill: 65,
      sociability: 80,
      honesty: 90,
    },
    style: "tight_aggressive",
    tells: {
      strongHand: ["adjusts_collar", "leans_forward", "smiles_slightly",],
      weakHand: ["looks_away", "fidgets_with_chips",],
      bluffing: ["taps_table", "whistles",],
      nervous: ["bites_lip", "avoids_eye_contact",],
    },
    reactions: {
      win: ["Well played.", "I had a good feeling about that hand.",],
      lose: ["You got me this time.", "Rematch?",],
      bigWin: ["I can't believe it!", "That was incredible!",],
      bigLose: ["I need a drink.", "That... stings.",],
      caughtCheating: ["I... I can explain.", "It's not what it looks like!",],
    },
  },

  grak: {
    traits: {
      aggression: 90,
      patience: 20,
      riskTolerance: 85,
      skill: 40,
      sociability: 60,
      honesty: 30,
    },
    style: "loose_aggressive",
    tells: {
      strongHand: ["grins", "leans_forward", "stacks_chips_loudly",],
      weakHand: ["slams_table", "yells",],
      bluffing: ["avoids_eye_contact", "sweats",],
      nervous: ["drinks_heavily", "swears",],
    },
    reactions: {
      win: ["HA! Easy money!", "You can't beat me!",],
      lose: ["Lucky fool!", "This isn't over!",],
      bigWin: ["I AM THE CHAMPION!", "Pay up, losers!",],
      bigLose: ["IMPOSSIBLE!", "You cheated!",],
      caughtCheating: ["So what if I did?", "You can't prove anything!",],
    },
  },
};
```

### AI Decision Tree

```
NPC Turn:
├── Pre-flop (Poker)
│   ├── Check hand strength
│   │   ├── Strong (top 20%): Raise 3x-5x
│   │   ├── Medium (middle 40%): Call or small raise
│   │   └── Weak (bottom 40%): Fold or bluff
│   ├── Check personality
│   │   ├── Aggressive: Raise more often
│   │   ├── Passive: Call more often
│   │   └── Maniac: Raise everything
│   └── Check context
│       ├── Winning streak: More aggressive
│       ├── Losing streak: More desperate
│       └── New opponent: More cautious

├── Post-flop (Poker)
│   ├── Evaluate hand improvement
│   │   ├── Made hand: Bet for value
│   │   ├── Drawing hand: Semi-bluff
│   │   └── Missed: Give up or bluff
│   ├── Check pot odds
│   │   ├── Good odds: Call/raise
│   │   └── Bad odds: Fold
│   └── Check opponent tendencies
│       ├── Folds a lot: Bluff more
│       ├── Calls a lot: Value bet more
│       └── Raises a lot: Trap with strong hands

├── Blackjack
│   ├── Check hand total
│   │   ├── Hard 17+: Stand
│   │   ├── Hard 12-16: Check dealer upcard
│   │   │   ├── Dealer 2-6: Stand
│   │   │   └── Dealer 7+: Hit
│   │   ├── Soft 17+: Stand
│   │   ├── Soft 16: Hit (unless dealer 2-6)
│   │   └── Hard 11: Double down
│   └── Check personality
│       ├── Risky: Double more often
│       └── Conservative: Hit less often

└── Dice Games
    ├── Yahtzee
    │   ├── Check scorecard gaps
    │   ├── Prioritize high-value categories
    │   ├── Keep pairs/three of a kind
    │   └── Go for straights if close
    └── Dice Duel
        ├── Roll and compare
        └── No decisions (pure luck)
```

### NPC Difficulty Scaling

```typescript
interface DifficultyScaling {
  // Scale NPC skill based on player level
  baseSkill: number;           // NPC's base skill (0-100)
  playerLevelModifier: number; // How much to adjust per player level

  // Example:
  // Player Level 1 vs NPC skill 50 → effective skill 45
  // Player Level 10 vs NPC skill 50 → effective skill 55
  // Player Level 20 vs NPC skill 50 → effective skill 65

  // Personality modifiers
  personalityModifiers: {
    beginnerFriendly: -10;  // Easier for new players
    competitive: +5;        // Harder when player is winning
    soreLoser: +10;         // Gets better when losing
    teachable: -15;         // Easier for learning
  };
}
```

---

## Economy Formulas

### Betting Math

```typescript
// Expected Value (EV) calculations
function calculateEV(bet: number, winChance: number, payout: number,): number {
  return (winChance * payout) - ((1 - winChance) * bet);
}

// Example: Blackjack
// Bet: 100g, Win chance: 42%, Payout: 100g (1:1)
// EV = (0.42 * 100) - (0.58 * 100) = 42 - 58 = -16
// House edge: 16%

// Example: Coin Flip
// Bet: 100g, Win chance: 50%, Payout: 100g (1:1)
// EV = (0.50 * 100) - (0.50 * 100) = 0
// No house edge (pure luck)
```

### Stakes Calculation

```typescript
function calculateStakes(
  npcWealth: number,
  playerGold: number,
  relationship: number,
  location: string,
): GameStakes {
  // Base stakes from NPC wealth
  const base = Math.floor(npcWealth * 0.1,);

  // Adjust for relationship
  const relationshipMod = relationship > 50 ? 0.5 : 1.0;

  // Adjust for location
  const locationMods: Record<string, number> = {
    tavern: 0.5,
    casino: 1.0,
    gambling_den: 1.5,
    backroom: 2.0,
  };
  const locationMod = locationMods[location] || 1.0;

  // Cap at player's gold
  const maxBet = Math.floor(playerGold * 0.25,);

  // Calculate final stakes
  const stakes = Math.min(
    Math.floor(base * relationshipMod * locationMod,),
    maxBet,
  );

  return {
    gold: stakes,
    items: [],
    reputation: Math.floor(stakes * 0.1,),
    relationship: 0,
  };
}
```

### Reward Distribution

```typescript
function calculateRewards(
  gameType: string,
  result: "win" | "lose" | "draw",
  stakes: GameStakes,
  performance: number, // 0-100 (how well they played)
  streak: number,
): GameReward {
  const baseGold = stakes.gold;

  // Win rewards
  if (result === "win") {
    const streakBonus = Math.min(streak * 0.1, 0.5,); // Max 50% bonus
    const performanceBonus = performance * 0.01; // Up to 100% bonus

    return {
      gold: Math.floor(baseGold * (1 + streakBonus + performanceBonus),),
      xp: Math.floor(baseGold * 0.5,),
      reputation: Math.floor(stakes.reputation * 1.5,),
      items: [],
      mood: { type: "happy", intensity: 50 + performance * 0.5, },
      memory: true,
    };
  }

  // Lose rewards (consolation)
  if (result === "lose") {
    return {
      gold: 0,
      xp: Math.floor(baseGold * 0.1,), // Small XP for playing
      reputation: -Math.floor(stakes.reputation * 0.5,),
      items: [],
      mood: { type: "sad", intensity: 30, },
      memory: streak > 3, // Remember if streak broken
    };
  }

  // Draw
  return {
    gold: 0,
    xp: Math.floor(baseGold * 0.2,),
    reputation: 0,
    items: [],
    mood: { type: "neutral", intensity: 0, },
    memory: false,
  };
}
```

### Anti-Exploit Formulas

```typescript
// Cooldown calculation
function getCooldown(consecutiveWins: number,): number {
  const baseCooldown = 5; // 5 seconds
  const winPenalty = consecutiveWins * 2; // +2s per win
  const maxCooldown = 60; // 60 seconds max
  return Math.min(baseCooldown + winPenalty, maxCooldown,);
}

// Daily limit check
function checkDailyLimit(userId: string, gameType: string,): boolean {
  const limits = {
    goldPerDay: 10000,
    gamesPerDay: 50,
    winsPerDay: 20,
    betsPerDay: 100,
  };

  const stats = getDailyStats(userId,);
  return (
    stats.goldWon < limits.goldPerDay &&
    stats.gamesPlayed < limits.gamesPerDay &&
    stats.gamesWon < limits.winsPerDay &&
    stats.totalBets < limits.betsPerDay
  );
}

// Streak protection
function getStreakProtection(streak: number,): number {
  // After 5 wins, increase difficulty
  if (streak >= 5) { return 0.8; // 80% win chance → 60%
   }
  if (streak >= 3) { return 0.9; // 90% win chance → 70%
   }
  return 1.0;
}
```

---

## Achievement & Progression

### Achievement Categories

```typescript
interface AchievementCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  achievements: Achievement[];
}

const categories: AchievementCategory[] = [
  {
    id: "card_games",
    name: "Card Shark",
    description: "Master the card games",
    icon: "🃏",
    achievements: [
      {
        id: "first_hand",
        name: "First Hand",
        description: "Play your first hand of blackjack",
        condition: { games: 1, },
      },
      { id: "blackjack_10", name: "Lucky Sevens", description: "Get 10 blackjacks", condition: { blackjacks: 10, }, },
      { id: "poker_pro", name: "Poker Pro", description: "Win 25 poker games", condition: { pokerWins: 25, }, },
      {
        id: "full_house",
        name: "Full House",
        description: "Get a Full House in poker",
        condition: { hands: "full_house", },
      },
      {
        id: "royal_flush",
        name: "Royal Flush",
        description: "Get a Royal Flush",
        condition: { hands: "royal_flush", },
      },
    ],
  },
  {
    id: "dice_games",
    name: "Dice Master",
    description: "Conquer the dice games",
    icon: "🎲",
    achievements: [
      {
        id: "yahtzee_first",
        name: "First Yahtzee",
        description: "Roll your first Yahtzee",
        condition: { yahtzee: 1, },
      },
      { id: "yahtzee_10", name: "Yahtzee Expert", description: "Roll 10 Yahtzees", condition: { yahtzee: 10, }, },
      {
        id: "dice_streak",
        name: "Hot Hand",
        description: "Win 10 dice duels in a row",
        condition: { diceStreak: 10, },
      },
    ],
  },
  {
    id: "luck_games",
    name: "Lady Luck",
    description: "Test your luck",
    icon: "🍀",
    achievements: [
      {
        id: "coin_streak",
        name: "Heads or Tails",
        description: "Win 10 coin flips in a row",
        condition: { coinStreak: 10, },
      },
      {
        id: "slot_jackpot",
        name: "Jackpot!",
        description: "Hit a slot machine jackpot",
        condition: { slotJackpot: 1, },
      },
      { id: "high_roller", name: "High Roller", description: "Bet 1000+ gold in one game", condition: { bet: 1000, }, },
    ],
  },
  {
    id: "social",
    name: "Social Butterfly",
    description: "Master social games",
    icon: "💬",
    achievements: [
      { id: "truth_10", name: "Truth Seeker", description: "Answer 10 truths", condition: { truths: 10, }, },
      { id: "dare_10", name: "Daredevil", description: "Complete 10 dares", condition: { dares: 10, }, },
      {
        id: "intimacy_100",
        name: "Soulmates",
        description: "Reach 100 intimacy with an NPC",
        condition: { intimacy: 100, },
      },
    ],
  },
  {
    id: "meta",
    name: "Completionist",
    description: "Play everything",
    icon: "🏆",
    achievements: [
      {
        id: "all_games",
        name: "Jack of All Trades",
        description: "Play every game type",
        condition: { uniqueGames: "all", },
      },
      {
        id: "win_all",
        name: "Master of All",
        description: "Win at least one of every game",
        condition: { uniqueWins: "all", },
      },
      { id: "play_100", name: "Veteran", description: "Play 100 total games", condition: { totalGames: 100, }, },
      { id: "play_1000", name: "Legend", description: "Play 1000 total games", condition: { totalGames: 1000, }, },
    ],
  },
];
```

### Progression System

```typescript
interface GameProgression {
  // Player level (from games)
  level: number;
  xp: number;
  xpToNext: number;

  // Titles (unlocked at milestones)
  titles: string[];

  // Skills (passive bonuses)
  skills: GameSkill[];
}

interface GameSkill {
  id: string;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  effect: SkillEffect;
}

const gameSkills: GameSkill[] = [
  {
    id: "card_sharp",
    name: "Card Sharp",
    description: "Better odds in card games",
    level: 0,
    maxLevel: 5,
    effect: { type: "card_bonus", perLevel: 2, }, // +2% win chance per level
  },
  {
    id: "dice_master",
    name: "Dice Master",
    description: "Better rolls in dice games",
    level: 0,
    maxLevel: 5,
    effect: { type: "dice_bonus", perLevel: 1, }, // +1 to roll per level
  },
  {
    id: "bluff_expert",
    name: "Bluff Expert",
    description: "Harder for NPCs to read your tells",
    level: 0,
    maxLevel: 5,
    effect: { type: "bluff_resistance", perLevel: 10, }, // +10% resistance per level
  },
  {
    id: "tell_reader",
    name: "Tell Reader",
    description: "Better at detecting NPC tells",
    level: 0,
    maxLevel: 5,
    effect: { type: "tell_detection", perLevel: 10, }, // +10% detection per level
  },
  {
    id: "lucky_streak",
    name: "Lucky Streak",
    description: "Longer streaks before difficulty increase",
    level: 0,
    maxLevel: 3,
    effect: { type: "streak_extension", perLevel: 2, }, // +2 wins before scaling
  },
];
```

---

## Tournament System

### Tournament Types

```typescript
interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  game: string;
  maxPlayers: number;
  minPlayers: number;
  entryFee: number;
  startTime: Date;
  duration: number; // minutes

  structure: TournamentStructure;
  prizes: TournamentPrizes;
  rules: TournamentRules;
}

type TournamentType =
  | "single_elimination" // Lose once = out
  | "double_elimination" // Lose twice = out
  | "round_robin" // Play everyone once
  | "swiss" // Pair similar records
  | "free_for_all"; // Everyone plays, highest score wins

interface TournamentStructure {
  rounds: number;
  gamesPerRound: number;
  timePerRound: number; // seconds
  byeRounds: number; // if odd players
}

interface TournamentPrizes {
  first: GameReward;
  second: GameReward;
  third: GameReward;
  participation: GameReward; // Everyone gets something
}

interface TournamentRules {
  allowedGames: string[];
  maxBetPerRound: number;
  timeLimitPerTurn: number;
  disconnectionPolicy: "forfeit" | "pause" | "bot";
}
```

### Tournament Bracket

```
Single Elimination Bracket (8 players):

Round 1          Round 2          Final
┌─────┐
│ P1  │──┐
│ P8  │  │
└─────┘  │    ┌─────┐
         ├───│ W1  │──┐
┌─────┐  │    │ W2  │  │
│ P2  │──┘    └─────┘  │
│ P7  │               │    ┌─────┐
└─────┘               ├───│CHAMP│
┌─────┐               │    └─────┘
│ P3  │──┐            │
│ P6  │  │    ┌─────┐  │
└─────┘  ├───│ W3  │──┘
┌─────┐  │    │ W4  │
│ P4  │──┘    └─────┘
│ P5  │
└─────┘
```

### Tournament Chat Flow

```
Tournament                 System                  Players
  │                         │                       │
  │  Registration open!     │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  /tournament join       │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │  Joined! 3/8 players    │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  ... waiting ...        │                       │
  │                         │                       │
  │  8/8 players!           │                       │
  │  Tournament starts in 60s│                      │
  │<────────────────────────│                       │
  │                         │                       │
  │  Round 1: You vs P8     │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  Game plays...          │                       │
  │                         │                       │
  │  You win! advancing to Round 2│                 │
  │<────────────────────────│                       │
  │                         │                       │
  │  Round 2: You vs W2     │                       │
  │<────────────────────────│                       │
  │                         │                       │
  │  ...                    │                       │
  │                         │                       │
  │  CHAMPION!              │                       │
  │  Prize: 1000g + Golden Cards│                   │
  │<────────────────────────│                       │
```

---

## Custom Card Game Builder

### Builder Interface

```
┌─────────────────────────────────────────────┐
│  CUSTOM CARD GAME BUILDER                   │
├─────────────────────────────────────────────┤
│  Game Name: [_______________]               │
│  Description: [_______________]             │
│  Players: [2] to [6]                        │
├─────────────────────────────────────────────┤
│  DECK CONFIGURATION                         │
│  ┌─────────────────────────────────────┐    │
│  │ Suits: [♥] [♠] [♦] [♣]            │    │
│  │ Ranks: [2-10] [J] [Q] [K] [A]      │    │
│  │ Special: [+Wild] [+Joker]          │    │
│  │ Custom Cards: [Add Card]            │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│  RULES                                      │
│  ┌─────────────────────────────────────┐    │
│  │ [Add Rule]                          │    │
│  │ Rule 1: [_______________] [Edit]    │    │
│  │ Rule 2: [_______________] [Edit]    │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│  WIN CONDITIONS                             │
│  ┌─────────────────────────────────────┐    │
│  │ [First to X points]                 │    │
│  │ [Most points after Y rounds]        │    │
│  │ [Last player standing]              │    │
│  │ [Custom condition: _______]         │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│  [Test Game]  [Save]  [Publish]            │
└─────────────────────────────────────────────┘
```

### Custom Game Schema

```typescript
interface CustomCardGame {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;

  // Deck
  deck: {
    suits: string[];
    ranks: string[];
    specialCards: SpecialCard[];
    customCards: CustomCard[];
  };

  // Rules
  rules: GameRule[];

  // Win conditions
  winConditions: WinCondition[];

  // UI
  ui: {
    layout: "standard" | "custom";
    components: string[];
    theme: string;
  };
}

interface GameRule {
  id: string;
  name: string;
  description: string;
  trigger: string; // "on_draw" | "on_play" | "on_discard" | etc.
  effect: RuleEffect;
  priority: number;
}

interface WinCondition {
  type: "first_to" | "most_after" | "last_standing" | "custom";
  value: number;
  description: string;
}
```

---

## Responsive & Accessibility

### Breakpoints

```css
/* Mobile: < 640px */
/* Tablet: 640px - 1024px */
/* Desktop: > 1024px */

.game-container {
  /* Mobile */
  @media (max-width: 640px) {
    .card {
      width: 40px;
      height: 56px;
    }
    .chip {
      width: 24px;
      height: 24px;
    }
    .button {
      padding: 8px 16px;
      font-size: 14px;
    }
  }

  /* Tablet */
  @media (min-width: 641px) and (max-width: 1024px) {
    .card {
      width: 56px;
      height: 78px;
    }
    .chip {
      width: 32px;
      height: 32px;
    }
    .button {
      padding: 10px 20px;
      font-size: 16px;
    }
  }

  /* Desktop */
  @media (min-width: 1025px) {
    .card {
      width: 72px;
      height: 100px;
    }
    .chip {
      width: 40px;
      height: 40px;
    }
    .button {
      padding: 12px 24px;
      font-size: 16px;
    }
  }
}
```

### Accessibility Features

```typescript
interface AccessibilityConfig {
  // Screen reader support
  ariaLabels: {
    card: (suit: string, rank: string,) => `${rank} of ${suit}`;
    dice: (value: number,) => `Dice showing ${value}`;
    chip: (amount: number,) => `${amount} gold chips`;
    button: (action: string,) => `${action} button`;
  };

  // Keyboard navigation
  keyboard: {
    enabled: boolean;
    shortcuts: {
      hit: "h";
      stand: "s";
      double: "d";
      fold: "f";
      roll: "r";
      confirm: "Enter";
      cancel: "Escape";
    };
  };

  // Color blind mode
  colorBlind: {
    enabled: boolean;
    patterns: {
      hearts: "●";
      diamonds: "◆";
      clubs: "♣";
      spades: "♠";
    };
  };

  // High contrast
  highContrast: {
    enabled: boolean;
    colors: {
      card: "#000000";
      background: "#FFFFFF";
      text: "#000000";
      accent: "#0000FF";
    };
  };

  // Animation reduction
  reduceMotion: {
    enabled: boolean;
    fallback: "instant" | "simple";
  };

  // Text size
  textScaling: {
    min: 0.8;
    max: 2.0;
    current: 1.0;
  };
}
```

### Keyboard Navigation Map

```
Tab Order:
1. Game title / status
2. Player hand / cards
3. Action buttons
4. Game log / chat
5. Settings / menu

Arrow Keys:
- Left/Right: Navigate cards
- Up/Down: Navigate options

Enter/Space:
- Select card / button

Escape:
- Cancel action / back

Number Keys:
- 1-9: Quick select cards (by position)
```

---

## Sound & Visual Feedback

### Sound Effects

```typescript
interface GameSounds {
  // Card sounds
  cardDeal: "card_deal.mp3";
  cardFlip: "card_flip.mp3";
  cardShuffle: "card_shuffle.mp3";
  cardDiscard: "card_discard.mp3";

  // Dice sounds
  diceRoll: "dice_roll.mp3";
  diceHit: "dice_hit.mp3";

  // Chip sounds
  chipBet: "chip_bet.mp3";
  chipCollect: "chip_collect.mp3";
  chipStack: "chip_stack.mp3";

  // Game events
  win: "win_fanfare.mp3";
  lose: "lose_trombone.mp3";
  blackjack: "blackjack_ding.mp3";
  yahtzee: "yahtzee_cheer.mp3";
  jackpot: "jackpot_bells.mp3";

  // UI sounds
  buttonClick: "button_click.mp3";
  timerWarning: "timer_tick.mp3";
  timerEnd: "timer_buzzer.mp3";
}
```

### Visual Effects

```typescript
interface VisualEffects {
  // Card animations
  cardDeal: {
    type: "slide";
    duration: 300;
    easing: "ease-out";
  };
  cardFlip: {
    type: "rotate";
    duration: 200;
    easing: "ease-in-out";
  };
  cardDiscard: {
    type: "fly";
    duration: 400;
    easing: "ease-in";
    destination: "discard_pile";
  };

  // Dice animations
  diceRoll: {
    type: "bounce";
    duration: 500;
    frames: 8;
  };

  // Win effects
  winCelebration: {
    type: "confetti";
    duration: 2000;
    colors: ["gold", "silver", "bronze",];
  };

  // Chip effects
  chipBet: {
    type: "fly";
    duration: 200;
    destination: "pot";
  };
  chipCollect: {
    type: "fly";
    duration: 300;
    destination: "player_stack";
    stagger: 50;
  };
}
```

### Color Scheme

```typescript
interface GameColors {
  // Card suits
  hearts: "#FF0000";
  diamonds: "#FF0000";
  clubs: "#000000";
  spades: "#000000";

  // Card face
  cardFace: "#FFFFFF";
  cardBack: "#1A237E";
  cardBorder: "#000000";

  // Chips
  chip1: "#CD7F32"; // Bronze (1g)
  chip5: "#C0C0C0"; // Silver (5g)
  chip25: "#FFD700"; // Gold (25g)
  chip100: "#E5E4E2"; // Platinum (100g)
  chip500: "#B9F2FF"; // Diamond (500g)

  // UI
  background: "#1B2838";
  surface: "#2A475E";
  text: "#FFFFFF";
  accent: "#66C0F4";
  success: "#4CAF50";
  warning: "#FFC107";
  error: "#F44336";

  // Pot
  potBorder: "#FFD700";
  potGlow: "rgba(255, 215, 0, 0.3)";
}
```

---

## Error Handling & Edge Cases

### Error Types

```typescript
type GameError =
  | "session_not_found"
  | "game_not_started"
  | "game_already_over"
  | "not_your_turn"
  | "invalid_action"
  | "insufficient_chips"
  | "insufficient_gold"
  | "player_disconnected"
  | "npc_unavailable"
  | "game_paused"
  | "timeout"
  | "cheating_detected"
  | "server_error";
```

### Error Handling

```typescript
function handleGameError(error: GameError, context: GameContext,): GameResult {
  switch (error) {
    case "session_not_found":
      return {
        success: false,
        message: "Game session expired. Starting new game...",
        action: "create_new_session",
      };

    case "not_your_turn":
      return {
        success: false,
        message: "Wait for your turn.",
        action: "none",
      };

    case "invalid_action":
      return {
        success: false,
        message: "That action isn't available right now.",
        action: "show_available_actions",
      };

    case "insufficient_chips":
      return {
        success: false,
        message: "Not enough chips. Lower your bet or buy more.",
        action: "show_chip_options",
      };

    case "player_disconnected":
      return {
        success: false,
        message: "Opponent disconnected. You win by default.",
        action: "forfeit_opponent",
        effects: [{ type: "gold", amount: context.pot, },],
      };

    case "timeout":
      return {
        success: false,
        message: "Time's up! Turn forfeited.",
        action: "auto_action",
      };

    case "cheating_detected":
      return {
        success: false,
        message: "Cheating detected! Game over.",
        action: "ban_player",
        effects: [{ type: "reputation", amount: -50, },],
      };
  }
}
```

### Edge Cases

```typescript
const edgeCases: EdgeCase[] = [
  {
    case: "tie in final round",
    solution: "Sudden death: next point wins",
  },
  {
    case: "all players disconnect",
    solution: "Cancel game, refund bets",
  },
  {
    case: "NPC crashes mid-game",
    solution: "Replace with generic NPC, continue game",
  },
  {
    case: "player has negative gold",
    solution: "Force bankruptcy, reset to starting chips",
  },
  {
    case: "game takes too long (>1 hour)",
    solution: "Force end, distribute pot proportionally",
  },
  {
    case: "invalid card/dice state",
    solution: "Reset to last valid state, log error",
  },
  {
    case: "concurrent game actions",
    solution: "Queue actions, process sequentially",
  },
  {
    case: "database save fails",
    solution: "Retry 3x, then restart game from last checkpoint",
  },
];
```

---

## Multiplayer Considerations

### Real-Time vs Turn-Based

```typescript
interface MultiplayerConfig {
  mode: "realtime" | "turnbased";

  realtime: {
    transport: "websocket";
    tickRate: 10; // Updates per second
    maxLatency: 100; // ms before desync
    reconciliation: true;
  };

  turnbased: {
    turnTimeout: 30; // seconds
    autoAction: "fold" | "check" | "random";
    reconnectionWindow: 60; // seconds
  };
}
```

### Sync Protocol

```
Client A                  Server                  Client B
  │                         │                       │
  │  Action: bet 50g        │                       │
  │────────────────────────>│                       │
  │                         │                       │
  │                         │  Validate action      │
  │                         │  Update state         │
  │                         │  Broadcast state      │
  │<────────────────────────│──────────────────────>│
  │                         │                       │
  │  State update           │                       │  State update
  │  Render new state       │                       │  Render new state
```

### Conflict Resolution

```typescript
function resolveConflict(
  actionA: GameAction,
  actionB: GameAction,
  timestampA: number,
  timestampB: number,
): GameAction {
  // Last-write-wins for simultaneous actions
  if (Math.abs(timestampA - timestampB,) < 100) {
    return timestampA > timestampB ? actionA : actionB;
  }

  // Otherwise, process in order
  return timestampA < timestampB ? actionA : actionB;
}
```

### Spectator Mode

```typescript
interface SpectatorConfig {
  // What spectators can see
  visible: {
    hands: boolean; // Player hands
    bets: boolean; // Betting history
    tells: boolean; // NPC tells
    chat: boolean; // Game chat
    pot: boolean; // Pot size
  };

  // What spectators can do
  actions: {
    chat: boolean; // Comment in game
    bet: boolean; // Side bets
    tip: boolean; // Tip players
    vote: boolean; // Vote on outcomes
  };

  // Limits
  maxSpectators: number;
  spectateDelay: number; // seconds delay (prevent cheating)
}
```

### Disconnection Handling

```typescript
interface DisconnectionPolicy {
  // Short disconnect (< 30s)
  short: {
    action: "pause";
    notification: "Opponent disconnected. Waiting...";
    reconnectionWindow: 30;
  };

  // Medium disconnect (30s - 5min)
  medium: {
    action: "auto_play";
    autoAction: "check" | "fold";
    notification: "Opponent disconnected. Playing automatically.";
    reconnectionWindow: 300;
  };

  // Long disconnect (> 5min)
  long: {
    action: "forfeit";
    notification: "Opponent forfeited. You win!";
    rewards: "full_pot";
  };
}
```

---

## Open Questions (Expanded)

1. **Cross-platform play**: Can mobile and desktop players play together?
2. **Replay system**: Can games be replayed/reviewed?
3. **Custom avatars**: Can players use custom avatars at game tables?
4. **Voice chat**: Should multiplayer games support voice?
5. **AI opponents**: Can players practice against AI before multiplayer?
6. **Game history**: How long to keep game history?
7. **Spectator betting**: Should spectators be able to bet on outcomes?
8. **Tournament scheduling**: How to handle time zones for tournaments?
9. **Card back designs**: Can players customize card backs?
10. **Table themes**: Can players choose table backgrounds?
