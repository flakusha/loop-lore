# Mini-Games: Design Document

**Status:** Draft
**Parent:** Epic: Mini-Games & Interactive Mechanics

---

## Table of Contents

1. [Game Catalog](#game-catalog)
2. [Integration Modes](#integration-modes)
3. [UI/UX Patterns](#uiux-patterns)
4. [Chat Logic](#chat-logic)
5. [VN Integration](#vn-integration)
6. [Battle Integration](#battle-integration)
7. [NPC Behavior](#npc-behavior)
8. [Economy & Rewards](#economy--rewards)
9. [Social Features](#social-features)

---

## Game Catalog

### Dice Games

#### Yahtzee

**Concept:** Classic dice game — roll 5 dice, fill scorecard, highest total wins.

**Gameplay:**

- 5 dice per roll, 3 rolls per turn
- 13 categories: Ones through Sixes, Three/Four of a Kind, Full House, Small Straight (4 in a row), Large Straight (5 in a row), Yahtzee (all same), Chance (any)
- First Yahtzee = 50 pts. Additional Yahtzees = +100 bonus each
- Player chooses which category to score after each turn
- 13 turns total, highest score wins

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  YAHTZEE                    Pot: 50 gold    │
├─────────────────────────────────────────────┤
│  Dice: [🎲3] [🎲5] [🎲5] [🎲1] [🎲5]      │
│                                             │
│  ☐ Keep  ☐ Keep  ☑ Keep  ☐ Keep  ☑ Keep   │
│                                             │
│  [Roll (2 left)]  [Score]  [Forfeit]       │
├─────────────────────────────────────────────┤
│  SCORECARD               You  │ NPC         │
│  Ones (3)               6    │ 8           │
│  Twos (0)               —    │ 10          │
│  Threes (15)            15   │ 12          │
│  Fours (8)              8    │ 16          │
│  Fives (15)             15   │ 20          │
│  Sixes (18)             18   │ 18          │
│  Three of Kind (0)      —    │ 22          │
│  Four of Kind (0)       —    │ —           │
│  Full House (25)        25   │ —           │
│  Sm Straight (30)       30   │ —           │
│  Lg Straight (40)       —    │ 40          │
│  Yahtzee (50)           —    │ —           │
│  Chance (14)            14   │ 19          │
│  ─────────────────────────────────────────  │
│  TOTAL                  131  │ 165         │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- Player types `/play yahtzee` or NPC challenges
- Each turn = one message with dice results
- Scorecard updates shown as formatted table
- Final results: "You scored 131. NPC scored 165. You lost 50 gold."

**VN Integration:**

- Scene: tavern gambling corner
- NPC: grizzled dice player, offers tutorial or high-stakes game
- Outcome affects: reputation (skilled gambler), gold, NPC relationship

**Battle Integration:**

- Not directly applicable (no combat)
- Can be used as side activity during rest/camp scenes

---

#### Dice Duel

**Concept:** Head-to-head dice battle — roll higher to deal damage.

**Gameplay:**

- Each player rolls 1d6 (or configurable: 2d6, d20)
- Higher roll wins the round
- Best of 5 rounds
- Winner deals damage equal to margin (roll difference)
- Special: Natural 6 = critical hit (+50% damage)
- Ties = no damage, re-roll

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  DICE DUEL                      Round 3/5   │
├─────────────────────────────────────────────┤
│  You: [🎲4]    vs    Goblin: [🎲2]         │
│                                             │
│  You win! Damage: 2                         │
│  Goblin HP: ████████░░ (80%)               │
│                                             │
│  [Roll Again]  [Forfeit]                    │
├─────────────────────────────────────────────┤
│  Round 1: You 5 vs 3 → You win (+2 dmg)    │
│  Round 2: You 2 vs 6 → Goblin win (+4 dmg) │
│  Round 3: You 4 vs 2 → You win (+2 dmg)    │
│  You: 12 HP │ Goblin: 8 HP                 │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- Integrated with battle system
- NPC types: "The goblin challenges you to a dice duel!"
- Each roll = one message
- Damage applied to HP after each round

**VN Integration:**

- Scene: duel at dawn, gambling den showdown
- High tension: stakes = life, honor, or treasure
- NPC taunts between rounds

**Battle Integration:**

- Direct combat mechanic — replaces normal attack for skill-check encounters
- Used for: bar fights, gambling debts, honor duels
- Integrates with HP, status effects, loot drops

---

#### Craps (Simplified)

**Concept:** Roll dice, bet on outcome.

**Gameplay:**

- Come-out roll: 7 or 11 = instant win, 2/3/12 = instant loss
- Any other number = "point" established
- Keep rolling until point hits (win) or 7 hits (loss)
- Double-or-nothing betting

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  CRAPS                         Bet: 100g    │
├─────────────────────────────────────────────┤
│  Phase: Point                               │
│  Point: 8                                   │
│                                             │
│  Last Roll: [🎲3] [🎲5] = 8                │
│  "You hit your point! You win 100 gold!"    │
│                                             │
│  [Roll]  [Double Down]  [Cash Out]          │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- Quick play: `/gamble 100 craps`
- Narrator describes each roll
- Dramatic tension on come-out roll

**VN Integration:**

- Casino scene, underground gambling den
- Can trigger story events (debt, rivalry, lucky streak)

---

### Card Games

#### Blackjack

**Concept:** Beat the dealer to 21 without busting.

**Gameplay:**

- Standard 52-card deck
- Face cards = 10, Aces = 1 or 11
- Dealer hits on soft 17, stands on hard 17
- Player options: Hit, Stand, Double Down (2x bet, one card), Split (pair only)
- Blackjack (A + 10-value) pays 3:2
- Insurance on dealer Ace (side bet, pays 2:1)
- Surrender: lose half bet, end hand

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  BLACKJACK                      Bet: 50g    │
├─────────────────────────────────────────────┤
│  Dealer:  [🂠] [♥7]         Total: ?+7     │
│                                             │
│  You:    [♠K] [♦A]         Total: 21       │
│          BLACKJACK!                         │
│                                             │
│  Chips: ●●●●● ○○○○○ (75)                  │
│                                             │
│  [Hit]  [Stand]  [Double]  [Split]  [Surr] │
├─────────────────────────────────────────────┤
│  Hand 1: [♠K] [♦A] = 21 (BLACKJACK)       │
│  Payout: +75 gold (3:2)                     │
└─────────────────────────────────────────────┘
```

**Card Rendering:**

```
Traditional:  [♠A] [♥K] [♦10] [♣7]
Unicode:      🂡 🂮 🃊 🃇
Text:         A♠ K♥ 10♦ 7♣
```

**Chat Logic:**

- `/play blackjack` → starts single hand
- `/play blackjack --hands 5` → multi-hand session
- NPC dealer announces: "Dealer shows 7. Your move."
- Results: "Blackjack! You win 75 gold."

**VN Integration:**

- Casino scene: velvet curtains, clinking chips
- NPC dealer personality: stoic, charming, suspicious
- Story triggers: cheating mechanic, card counting, NPC tells
- Outcome: win = respect, lose = debt, blackjack = special scene

**Battle Integration:**

- Not direct combat, but:
  - Gambling den infiltration (blackjack skill check)
  - Card shark encounter (social battle)
  - High-stakes tournament (multi-round event)

---

#### Poker (5-Card Draw)

**Concept:** Best hand wins pot. Bluffing encouraged.

**Gameplay:**

- 2-6 players (human + NPC)
- Standard 52-card deck
- Blinds: small (10), big (25)
- Phases: Deal → Bet → Draw → Bet → Showdown
- Hand rankings: Royal Flush > Straight Flush > Four of a Kind > Full House > Flush > Straight > Three of a Kind > Two Pair > One Pair > High Card
- Draw: discard 0-5 cards, receive replacements
- Bluffing: NPCs have detectable tells based on personality

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  POKER - 5-Card Draw         Pot: 275 gold │
├─────────────────────────────────────────────┤
│  Players:                                   │
│  [NPC: Elena]  Bet: 25  │  [NPC: Grak]    │
│  [NPC: Mira]   Bet: 50  │  [You]          │
├─────────────────────────────────────────────┤
│  Your Hand:                                 │
│  [♠K] [♥K] [♦K] [♣A] [♠9]                │
│                                             │
│  Phase: Draw (choose cards to replace)      │
│  ☑ [♠K] ☑ [♥K] ☑ [♦K] ☐ [♣A] ☐ [♠9]   │
│                                             │
│  [Draw]  [Check]  [Bet 50]  [Raise 100]    │
│  [Fold]  [All-In]                           │
├─────────────────────────────────────────────┤
│  NPC Tells:                                 │
│  Elena: "She adjusts her collar." (nervous) │
│  Grak: "He grins." (strong hand)            │
│  Mira: "She taps the table." (bluffing)     │
└─────────────────────────────────────────────┘
```

**NPC Tells System:**

```
Personality → Tell Mapping:
- Nervous: adjusts collar, fidgets with chips, looks away
- Confident: grins, leans forward, stacks chips loudly
- Bluffing: taps table, whistles, avoids eye contact
- Strong: stares you down, raises slowly, calm voice
- Tilt: slams table, bets wildly, voice cracks
```

**Chat Logic:**

- `/play poker` → starts 4-player game
- Each phase = one message
- Draw phase: player types which cards to keep
- Showdown: dramatic reveal with NPC reactions
- Chat history shows betting progression

**VN Integration:**

- Scene: smoky tavern backroom, candlelit
- NPC characters: each with distinct personality and tells
- Story: tournament arc, debt collector, love interest at the table
- Outcome: win = reputation + gold, lose = debt + rivalry

**Battle Integration:**

- Social combat: poker face vs NPC perception
- Skill checks: Charisma (bluffing), Wisdom (reading tells), Intelligence (odds)
- Tournament: multi-round event with bracket system

---

#### Baccarat

**Concept:** Player vs Banker — bet on who gets closest to 9.

**Gameplay:**

- Two hands dealt: Player and Banker
- Card values: 2-9 = face value, 10/J/Q/K = 0, Ace = 1
- Only last digit of sum matters (15 = 5)
- Natural: 8 or 9 on first two cards = instant win
- Third card rules (fixed, no player choice)
- Bet on: Player, Banker (5% commission), or Tie

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  BACCARAT                       Bet: 100g   │
├─────────────────────────────────────────────┤
│  Player: [♠7] [♥2] = 9    NATURAL!         │
│  Banker: [♦K] [♣5] = 5                     │
│                                             │
│  "Player wins with a natural 9!"            │
│                                             │
│  [Bet Player]  [Bet Banker]  [Bet Tie]     │
├─────────────────────────────────────────────┤
│  Road Map (trend):                          │
│  P B B P T P B B P P B                     │
│  ● ○ ○ ● ○ ● ○ ○ ● ● ○                    │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play baccarat` → automated (no player decisions after bet)
- Focus on betting decisions, not card play
- Dramatic narration: "The banker draws a third card..."

**VN Integration:**
-贵族 casino scene, high society

- NPC: wealthy aristocrat, gambling addict, spy
- Stakes: social status, political leverage

---

#### War

**Concept:** Simplest card game — higher card wins.

**Gameplay:**

- Split deck evenly between two players
- Both reveal top card simultaneously
- Higher card wins both (added to bottom of winner's deck)
- Tie = "war" — each places 3 face-down cards, then reveals
- Game ends when one player has all cards or time limit

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  WAR                           Cards: 26/52 │
├─────────────────────────────────────────────┤
│  You:  [♠Q]  vs  Goblin: [♥8]              │
│                                             │
│  You win! Q > 8                             │
│  Cards: You 28 │ Goblin 24                  │
│                                             │
│  [Flip]                                     │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- Quick play: `/play war`
- Auto-play option: `/play war --auto` (NPC plays optimally)
- Results summary after each round

**VN Integration:**

- Teaching tool: NPC teaches child character card games
- Low-stakes gambling scene
- Time-filler during travel/waiting scenes

---

### Luck Games

#### Coin Flip

**Concept:** Binary gamble — heads or tails.

**Gameplay:**

- Choose heads or tails
- Set stake amount
- Flip: 50/50 chance
- Double-or-nothing option after win
- Streak bonuses: 3+ wins = extra gold

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  COIN FLIP                     Streak: 3    │
├─────────────────────────────────────────────┤
│                                             │
│           🪙                                │
│         (spinning)                          │
│                                             │
│  [Heads]  [Tails]  [Cash Out]              │
│                                             │
│  Stake: 100 gold │ Potential: 200 gold      │
├─────────────────────────────────────────────┤
│  History: H H T H H H (current streak: 3)  │
│  Streak Bonus: +50 gold at 3 wins!         │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- Quick play: `/gamble 100 coinflip heads`
- Narrator: "The coin spins... it's heads! You win 100 gold."
- Streak announcements: "Three in a row! Bonus 50 gold!"

**VN Integration:**

- Quick decision mechanic: coin flip determines story branch
- Character personality: gambler trait = addicted to coin flips
- Dramatic moment: life-or-death coin flip

**Battle Integration:**

- Tie-breaker: when two attacks are equal, coin flip decides
- Lucky charm item: coin flip always wins (one-time use)

---

#### Higher/Lower

**Concept:** Guess if next card is higher or lower.

**Gameplay:**

- Dealer shows one card
- Player guesses: higher or lower
- Correct = win stake, continue
- Wrong = lose stake, game over
- Can cash out at any time
- Streak multiplier: each correct guess = 1.5x payout

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  HIGHER/LOWER                 Streak: 4     │
├─────────────────────────────────────────────┤
│                                             │
│  Current Card: [♥7]                         │
│                                             │
│  Next card: Higher or Lower?                │
│                                             │
│  [Higher ↑]  [Lower ↓]  [Cash Out (810g)]  │
├─────────────────────────────────────────────┤
│  History: L→H→H→H→H (streak: 4)           │
│  Stake: 100g │ Current Value: 810g          │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play higher-lower` → starts game
- Each guess = one message
- Narrator: "You guess higher... the next card is Queen! Correct!"
- Cash out: "You walk away with 810 gold."

**VN Integration:**

- Tavern gambling scene
- NPC: card sharp, offers "sure thing" (actually cheating)
- Story: winning streak attracts attention (good and bad)

---

#### Slots

**Concept:** Pull lever, match symbols, win prizes.

**Gameplay:**

- 3 reels, each with symbols
- Match 3 = jackpot (100x bet)
- Match 2 = 10x bet
- Special symbols: Wild (matches any), Scatter (bonus round)
- Auto-play option

**Symbols:**

```
Common:    🍒 🍋 🍊 🍇
Medium:    🔔 ⭐ 💎
Rare:      7️⃣ 🎰 💰
Wild:      🃏
Scatter:   ⭐ (3x = free spins)
```

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  SLOTS                         Bet: 10g     │
├─────────────────────────────────────────────┤
│  ┌─────┬─────┬─────┐                       │
│  │ 🍒  │ 🍒  │ 🍒  │   JACKPOT! 1000g     │
│  │ 🍋  │ 🍋  │ 🍋  │                       │
│  │ 🍊  │ 🍊  │ 🍊  │                       │
│  └─────┴─────┴─────┘                       │
│                                             │
│  [Spin]  [Auto-Spin x10]  [Max Bet]        │
├─────────────────────────────────────────────┤
│  Balance: 500g │ Total Won: 1200g          │
│  History: 🍋🍋🍋 (10g) 🍒🍒🍒 (1000g)    │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/gamble 10 slots` → single spin
- `/gamble 100 slots --auto 10` → 10 auto spins
- Narrator: "The reels spin... cherry, cherry, cherry! Jackpot!"

**VN Integration:**

- Casino scene: bright lights, sounds
- NPC: slot machine addict, casino owner
- Story: jackpot = life-changing, attracts thieves

---

#### Roulette (Simplified)

**Concept:** Bet on number/color, spin wheel.

**Gameplay:**

- Bet on: Red/Black (1:1), Odd/Even (1:1), Specific Number (35:1)
- European wheel (single zero)
- Minimum/maximum bets
- Visual spinning animation

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  ROULETTE                      Bet: 50g     │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────┐            │
│  │      🎡 (spinning)         │            │
│  │  0  1  2  3  4  5  6      │            │
│  │  7  8  9  10 11 12 13     │            │
│  │  14 15 16 17 18 19 20     │            │
│  │  21 22 23 24 25 26 27     │            │
│  │  28 29 30 31 32 33 34 35  │            │
│  └─────────────────────────────┘            │
│                                             │
│  [Red]  [Black]  [Odd]  [Even]  [Number_]  │
├─────────────────────────────────────────────┤
│  Result: 17 (Black, Odd)                    │
│  Your bet: Black → Win 50g!                 │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play roulette red` → bet on red
- Narrator: "The wheel spins... 17, black! You win!"

**VN Integration:**

- Casino scene, high-stakes tournament
- NPC: professional gambler, casino security
- Story: rigged wheel, cheating, dramatic reveal

---

### Skill Games

#### Gwent (Witcher-style)

**Concept:** Collectible card game — build deck, outscore opponent.

**Gameplay:**

- Each player has 10 cards
- 3 rounds
- Play one card per turn
- Cards have: type (melee/ranged/siege), strength, special abilities
- Special cards: weather, spy, medic, scorch
- Must win 2 of 3 rounds
- Total strength per row = score

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  GWENT                     Round 2/3        │
├─────────────────────────────────────────────┤
│  Opponent Score: 24  │  Your Score: 31      │
│                                             │
│  ┌─ Siege (x2) ─────────────────────────┐  │
│  │ [12] [8]                              │  │
│  ├─ Ranged (x1) ────────────────────────┤  │
│  │ [6]                                   │  │
│  ├─ Melee (x3) ─────────────────────────┤  │
│  │ [10] [7] [5]                          │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Your Hand:                                 │
│  [Melee 9] [Ranged 4] [Siege 11] [Spy 0]  │
│  [Weather ❄️] [Scorch 🔥] [Medic 💊]      │
│                                             │
│  [Play Card]  [Pass]  [Forfeit]            │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play gwent` → starts match
- Each card play = one message
- Narrator describes each play
- Score updates after each turn

**VN Integration:**

- Tavern scene: "A stranger challenges you to Gwent."
- NPC: deck builder, tournament organizer
- Story: rare cards as quest items, tournament prize

**Battle Integration:**

- Alternate combat system: card-based instead of dice
- Each card = one attack/defense per turn
- Special cards = spells/abilities

---

#### Trivia

**Concept:** Knowledge quiz — answer questions for gold.

**Gameplay:**

- Questions from: lore, characters, locations, items
- Multiple choice (4 options)
- Timer: 10 seconds per question
- Streak bonuses: 3+ correct = multiplier
- Difficulty: Easy (50g), Medium (100g), Hard (200g)

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  TRIVIA                       Streak: 2     │
├─────────────────────────────────────────────┤
│  Question 5/10          Category: Lore      │
│                                             │
│  "Who forged the Shadowblade?"             │
│                                             │
│  [A] The Dwarven King                       │
│  [B] The Shadow Mage ✓                      │
│  [C] The Elven Smith                        │
│  [D] The Dragon                             │
│                                             │
│  Time: ████████░░ (8s)                      │
├─────────────────────────────────────────────┤
│  Correct! +100 gold (streak bonus: +50)     │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play trivia` → random difficulty
- `/play trivia hard` → hard questions
- Narrator reads question, player types A/B/C/D
- Results: "Correct! The Shadow Mage forged it."

**VN Integration:**

- Library scene, scholar NPC
- Quiz show in tavern
- Lore reveal through questions

**Battle Integration:**

- Intelligence check: trivia questions determine spell success
- Knowledge contest with rival mage

---

#### Memory Match

**Concept:** Flip cards, match pairs.

**Gameplay:**

- Grid of face-down cards (4x4, 6x6)
- Flip two cards per turn
- Match = keep cards, go again
- Mismatch = flip back, next player
- Most pairs wins
- Bonus: complete under time limit

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  MEMORY MATCH                  Pairs: 5/8   │
├─────────────────────────────────────────────┤
│  ┌────┬────┬────┬────┐                     │
│  │ 🗡️ │ ?  │ ?  │ 🛡️ │                     │
│  ├────┼────┼────┼────┤                     │
│  │ ?  │ 🗡️ │ ?  │ ?  │                     │
│  ├────┼────┼────┼────┤                     │
│  │ ?  │ ?  │ 🛡️ │ ?  │                     │
│  ├────┼────┼────┼────┤                     │
│  │ ?  │ ?  │ ?  │ ?  │                     │
│  └────┴────┴────┴────┘                     │
│                                             │
│  [Flip Card] (click position)              │
├─────────────────────────────────────────────┤
│  You: 5 pairs │ NPC: 3 pairs               │
│  Time: 2:15                                │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play memory` → starts 4x4 grid
- Player types position (e.g., "A1", "B3")
- Narrator: "You flip card at B2... it's a sword! You flip B1... nothing."

**VN Integration:**

- Puzzle scene: ancient temple, magical lock
- NPC: child character, memory challenge
- Story: correct matches reveal lore

---

### Social Games

#### Truth or Dare

**Concept:** Social game — build relationships through vulnerability.

**Gameplay:**

- Players take turns choosing "truth" or "dare"
- Truth: answer question honestly (affects intimacy)
- Dare: perform action (affects mood, reputation)
- Refusal: lose trust with asking player
- Escalation: questions/dares get more intense

**UI/UX:**

```
┌─────────────────────────────────────────────┐
│  TRUTH OR DARE               Elena's Turn   │
├─────────────────────────────────────────────┤
│  Elena: "Truth or dare?"                    │
│                                             │
│  [Truth]  [Dare]  [Pass (lose trust)]      │
├─────────────────────────────────────────────┤
│  You chose: Truth                           │
│  Elena: "Have you ever killed someone?"     │
│                                             │
│  [Answer honestly]  [Lie (if caught: -20)]  │
├─────────────────────────────────────────────┤
│  History:                                   │
│  Round 1: You truth (Elena +5 intimacy)     │
│  Round 2: Elena dare (you +3 mood)          │
│  Round 3: You truth (Elena +10 intimacy)    │
└─────────────────────────────────────────────┘
```

**Chat Logic:**

- `/play truth-or-dare` → starts with NPC
- Player types choice or answer
- Narrator describes reactions
- Effects applied immediately

**VN Integration:**

- Campfire scene, intimate moment
- NPC: romantic interest, rival, friend
- Story: reveals character backstory, builds relationships

**Battle Integration:**

- Social combat: dare = challenge, truth = confession
- Reputation damage from embarrassing truths

---

## Integration Modes

### Chat Mode

**Trigger:** Commands or NPC dialogue
**Flow:**

1. Player types `/play <game>` or NPC invites
2. Game session created (DB)
3. Game UI rendered (HTMX)
4. Player interacts via buttons/commands
5. Actions processed by game engine
6. Results shown in chat
7. Effects applied (gold, XP, reputation)
8. Game ends → results summary

**Chat Integration Patterns:**

```
# Direct command
/player → /play blackjack
/npc → /challenge @Elena poker
/quick → /gamble 100 coinflip heads

# NPC-initiated
NPC: "Fancy a game of cards?"
  → [Accept] [Decline] [Counter-offer]

# Story-triggered
Story event → game_invite → game session
```

**Chat Flooding Prevention:**

- Group game actions into single message
- Use HTMX partial updates (no full page reload)
- Debounce rapid actions (dice rolls)
- Summary mode: compact results after game ends

### VN Mode

**Trigger:** Scene type "game"
**Flow:**

1. VN scene reaches game trigger
2. Game session created with context
3. Game UI replaces scene temporarily
4. Player plays game
5. Results affect story branch
6. Story continues based on outcome

**VN Scene Integration:**

```typescript
// VN scene with game
const scene: VNScene = {
  id: "tavern_poker",
  type: "game",
  game: "poker",
  participants: ["player", "elena", "grak", "mira",],
  stakes: { gold: 200, reputation: 10, },
  onSuccess: {
    dialogue: "You won! Elena looks impressed.",
    nextScene: "elena_impressed",
    effects: [{ type: "intimacy", target: "elena", amount: 5, },],
  },
  onFailure: {
    dialogue: "You lost everything. Grak laughs.",
    nextScene: "grak_mockery",
    effects: [{ type: "reputation", target: "player", amount: -5, },],
  },
};
```

**VN UI Overlay:**

```
┌─────────────────────────────────────────────┐
│  [VN Scene Background]                      │
│  ┌─────────────────────────────────────┐    │
│  │  [Game UI Overlay]                  │    │
│  │  (semi-transparent background)      │    │
│  │  Game controls render here          │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  "Elena leans forward. 'Your bet, stranger.'"│
│                                             │
│  [Continue]  [Game Menu]                    │
└─────────────────────────────────────────────┘
```

### Battle Mode

**Trigger:** Battle event or skill check
**Flow:**

1. Battle encounter triggers game
2. Game session created with battle context
3. Game replaces attack/action for this turn
4. Results = damage, status effects, loot
5. Battle continues

**Battle Integration Patterns:**

```
# Dice duel replaces attack
Player attacks → dice duel → damage applied

# Gambling for loot
Player loots chest → higher/lower game → reward multiplier

# Social battle
NPC challenges → poker → reputation/relationship effects

# Skill check
"Can you win this game?" → game result → success/failure
```

**Battle UI Integration:**

```
┌─────────────────────────────────────────────┐
│  BATTLE: Goblin Ambush                      │
├─────────────────────────────────────────────┤
│  Goblin HP: ██████░░░░ (60%)               │
│  Your HP: ██████████ (100%)                 │
├─────────────────────────────────────────────┤
│  ┌─ DICE DUEL ────────────────────────────┐│
│  │ You: [🎲5] vs Goblin: [🎲3]            ││
│  │ You win! Damage: 2                      ││
│  └────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│  [Attack] [Magic] [Item] [Flee] [Game]     │
└─────────────────────────────────────────────┘
```

---

## NPC Behavior

### Personality-Based Play Styles

```typescript
interface NPCGamePersonality {
  // How they play
  aggression: number; // 0-100: how much they bet/raise
  riskTolerance: number; // 0-100: willingness to bluff/gamble
  skill: number; // 0-100: optimal play vs mistakes
  tells: Tell[]; // Detectable behaviors

  // How they react
  winReaction: "gloat" | "humble" | "quiet" | "generous";
  loseReaction: "angry" | "gracious" | "sore" | "determined";

  // Story integration
  motivation: "gold" | "fun" | "reputation" | "manipulation" | "love";
  cheatChance: number; // 0-1: will they cheat?
}

// Example NPCs:
const elena: NPCGamePersonality = {
  aggression: 60,
  riskTolerance: 70,
  skill: 55,
  tells: [
    { condition: "strong_hand", behavior: "adjusts_collar", },
    { condition: "bluffing", behavior: "taps_table", },
  ],
  winReaction: "humble",
  loseReaction: "determined",
  motivation: "fun",
  cheatChance: 0,
};

const grak: NPCGamePersonality = {
  aggression: 90,
  riskTolerance: 85,
  skill: 40,
  tells: [
    { condition: "strong_hand", behavior: "grins", },
    { condition: "bluffing", behavior: "avoids_eye_contact", },
  ],
  winReaction: "gloat",
  loseReaction: "angry",
  motivation: "gold",
  cheatChance: 0.2,
};
```

### NPC Game Triggers

```typescript
// When NPCs offer games
interface NPCGameTrigger {
  location: string[]; // Where they offer games
  timeOfDay: string[]; // When they offer
  relationshipMin: number; // Minimum relationship to offer
  goldMin: number; // Minimum player gold
  personality: string[]; // Which personalities offer
}

// Examples:
const triggers: NPCGameTrigger[] = [
  {
    location: ["tavern", "casino", "gambling_den",],
    timeOfDay: ["evening", "night",],
    relationshipMin: 0,
    goldMin: 50,
    personality: ["gambler", "social", "trickster",],
  },
  {
    location: ["camp", "tavern",],
    timeOfDay: ["any",],
    relationshipMin: 20,
    goldMin: 10,
    personality: ["friendly", "competitive",],
  },
];
```

### NPC Cheating Mechanics

```typescript
interface CheatMechanic {
  // How NPCs cheat
  methods: ("marked_cards" | "loaded_dice" | "peeking" | "collusion")[];

  // Detection
  detectionSkill: "perception" | "intelligence" | "investigation";
  detectionDC: number; // Difficulty class to detect
  detectionClues: string[]; // What player notices

  // Consequences
  caughtConsequences: {
    reputation: number; // Reputation loss
    relationship: number; // Relationship damage
    gold: number; // Get money back
    violence: boolean; // Fight breaks out
  };
}
```

---

## Economy & Rewards

### Reward Types

```typescript
interface GameReward {
  gold: number; // Direct gold
  xp: number; // Experience points
  items: ItemReward[]; // Physical items
  reputation: number; // Social reputation
  intimacy: number; // Relationship progress
  mood: MoodEffect; // Emotional state
  memory: boolean; // Creates memory event
  achievement: string; // Unlocks achievement
}

interface ItemReward {
  itemId: string;
  quantity: number;
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
  dropChance: number; // 0-1
}
```

### Stakes System

```typescript
interface GameStakes {
  // What's at risk
  gold: number; // Gold bet
  items: string[]; // Items wagered
  reputation: number; // Reputation at stake
  relationship: string; // Relationship affected
  favor: string; // NPC favor owed

  // Special stakes
  honorDuel: boolean; // Life-or-death
  debt: boolean; // Loser owes winner
  debtAmount: number; // How much debt
  debtDeadline: number; // Days to pay back
}
```

### Economy Balance

```typescript
interface GameEconomyConfig {
  // Limits
  maxBetPerGame: number; // Max bet per single game
  maxBetPerDay: number; // Daily betting limit
  minBet: number; // Minimum bet
  startingChips: number; // Free chips for new players

  // Payouts
  houseEdge: number; // 0.02 = 2% house edge
  jackpotMultiplier: number; // Jackpot payout multiplier
  streakBonus: number; // Bonus per streak win

  // Anti-exploit
  cooldownBetweenGames: number; // Seconds between games
  maxGamesPerHour: number; // Rate limit
  maxConsecutiveWins: number; // Anti-farming threshold
}
```

---

## Social Features

### Leaderboards

```typescript
interface Leaderboard {
  type: "global" | "game" | "weekly" | "friends";
  entries: LeaderboardEntry[];
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number; // Total winnings / score
  gamesPlayed: number;
  winRate: number;
  streak: number;
}
```

### Achievements

```typescript
interface GameAchievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: AchievementCondition;
  reward: GameReward;
}

// Examples:
const achievements: GameAchievement[] = [
  {
    id: "first_win",
    name: "First Victory",
    description: "Win your first game",
    condition: { wins: 1, },
    reward: { gold: 100, },
  },
  {
    id: "poker_pro",
    name: "Poker Pro",
    description: "Win 10 poker games",
    condition: { game: "poker", wins: 10, },
    reward: { gold: 500, item: "golden_cards", },
  },
  {
    id: "lucky_streak",
    name: "Lucky Streak",
    description: "Win 5 games in a row",
    condition: { streak: 5, },
    reward: { gold: 200, achievement: "lucky_charm", },
  },
  {
    id: "high_roller",
    name: "High Roller",
    description: "Bet 1000+ gold in one game",
    condition: { bet: 1000, },
    reward: { reputation: 50, },
  },
  {
    id: "card_shark",
    name: "Card Shark",
    description: "Win 50 card games",
    condition: { category: "card", wins: 50, },
    reward: { gold: 1000, item: "lucky_deck", },
  },
];
```

### Spectating

```typescript
interface SpectatorSystem {
  // Can others watch?
  allowSpectators: boolean;
  maxSpectators: number;

  // What spectators see
  visibleInfo: {
    hands: boolean; // Can see player hands?
    bets: boolean; // Can see bets?
    tells: boolean; // Can see NPC tells?
    chat: boolean; // Can see game chat?
  };

  // Spectator actions
  canChat: boolean; // Can spectators comment?
  canBet: boolean; // Can spectators side-bet?
  canTip: boolean; // Can spectators tip players?
}
```

### Chat History Integration

```typescript
// Game results appear in chat history
interface ChatGameMessage {
  type: "game_start" | "game_action" | "game_result";
  gameId: string;
  sessionId: string;

  // For game_start
  players?: string[];
  stakes?: GameStakes;

  // For game_action
  action?: GameAction;
  result?: GameResult;

  // For game_result
  winner?: string;
  summary?: string;
  effects?: GameEffect[];

  // Timestamp
  timestamp: Date;
}
```

---

## Open Questions

1. **Real-time multiplayer**: WebSocket for live games or turn-based polling?
2. **NPC AI depth**: How complex should NPC play styles be?
3. **NSFW variants**: Strip poker, truth or dare variants?
4. **Save/load**: Can games be paused and resumed?
5. **Spectator chat**: Should spectators be able to comment?
6. **Tournament system**: Multi-round bracket tournaments?
7. **Card collecting**: Can players collect custom decks?
8. **Cross-game progression**: Does playing games unlock story content?
