<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Mini-Games: Deep Mechanics & Game-Specific Designs

## Individual Game Deep-Dives

### Rock-Paper-Scissors (RPS)

**Game State:**

```
Game ID: uuid
Player 1: { id, hand?, score }
Player 2: { id, hand?, score, isNPC }
Status: waiting | choosing | resolving | finished
Best of: 1 | 3 | 5
Timer: seconds remaining
```

**Detailed Flow:**

1. Player 1 creates game with bet amount
2. System checks funds, locks bet
3. Both players see countdown timer
4. Hands revealed simultaneously
5. Resolution: win/lose/draw
6. Best of tracking
7. Final payout

**NPC RPS AI:**

```
function chooseRPS(opponentHistory, personality) {
  if (opponentHistory.length < 2) return randomHand();
  
  const patterns = detectPatterns(opponentHistory);
  
  // Aggressive NPC: favors Rock
  if (personality.aggression > 7) {
    return Math.random() < 0.6 ? 'rock' : randomHand();
  }
  
  // Adaptive NPC: counters player tendencies
  const playerTendency = findMostFrequent(opponentHistory);
  return beats(playerTendency);
  
  // Bluffing NPC: shows one, plays another
  if (personality.honesty < 3) {
    const displayed = chooseFakeHand();
    return beats(displayed);
  }
}
```

**Pattern Detection:**

- Sequential: Rock → Rock → Rock (expect Rock again)
- Alternating: Rock → Scissors → Rock → Scissors (expect Scissors)
- Opponent's counter: If player always counters last move

**Chat Command:**

```
/rps [opponent] [bet] [best-of]
```

**VN Scene Example:**

```typescript
{
  type: 'game',
  game: {
    type: 'rps',
    opponent: 'tough_bouncer',
    bet: 50,
    dialogue: {
      start: "You challenged the bouncer to rock-paper-scissors. Best of three!",
      win: "Ha! You beat him. He grudgingly hands over the prize.",
      lose: "You lost. The bouncer laughs and pockets your coins.",
      draw: "Tied again? You're both stubborn."
    }
  }
}
```

---

### Higher/Lower Dice

**Game State:**

```
Game ID: uuid
Player: { id, bet, choice, history[] }
Dealer: { roll: number | null }
Dice Type: d6 | d8 | d10 | d12 | d20
Streak: number
Payout Multiplier: number
Status: waiting | choosing | rolling | resolving | finished
```

**Payout Calculation:**

```
Base multiplier = 2.0
Streak bonus = streak * 0.5
Dice adjustment:
  d6: +0.25 (easier to predict)
  d8: +0.0
  d10: -0.25
  d12: -0.5
  d20: -0.75
Final multiplier = base + streak bonus + dice adjustment
```

**Probability Table:**

| Dice | Lower Chance | Higher Chance | Even Chance |
| ---- | ------------ | ------------- | ----------- |
| d6   | 5/11 (45%)   | 5/11 (45%)    | 1/11 (9%)   |
| d8   | 7/15 (47%)   | 7/15 (47%)    | 1/15 (7%)   |
| d10  | 9/19 (47%)   | 9/19 (47%)    | 1/19 (5%)   |
| d12  | 11/23 (48%)  | 11/23 (48%)   | 1/23 (4%)   |
| d20  | 19/39 (49%)  | 19/39 (49%)   | 1/39 (3%)   |

**Double Down Option:**

- After correct prediction, player can double bet
- Only available if streak >= 3
- Risk: lose entire accumulated payout

**NPC Higher/Lower AI:**

```
function chooseHigherLower(dealerRoll, diceType, personality) {
  // Conservative: always picks the safer option
  if (personality.risk < 3) {
    return dealerRoll > diceType / 2 ? 'lower' : 'higher';
  }
  
  // Gambler: likes the middle numbers
  if (dealerRoll >= diceType * 0.3 && dealerRoll <= diceType * 0.7) {
    return Math.random() < 0.5 ? 'higher' : 'lower';
  }
  
  // Edge player: picks based on probabilities
  return dealerRoll <= diceType / 2 ? 'higher' : 'lower';
}
```

**Streak Protection:**

- If player loses 3+ in row, offer "lucky charm" (auto-win once, costs 2x bet)
- Streak counter resets on loss

---

### Yahtzee (Dice Poker)

**Game State:**

```
Game ID: uuid
Player: { id, bet }
Dice: [number, number, number, number, number]
Dice Kept: [boolean x5]
Rolls Left: 3 | 2 | 1
Scorecard: {
  ones: number | null,
  twos: number | null,
  ...
  yahtzee: number | null,
  bonus: boolean
}
Status: rolling | choosing | scoring | finished
```

**Hand Rankings:**

| Hand                  | Value          | Example                    |
| --------------------- | -------------- | -------------------------- |
| Yahtzee (5 of a kind) | 50             | [5,5,5,5,5]                |
| Large Straight        | 40             | [1,2,3,4,5] or [2,3,4,5,6] |
| Full House            | 25             | [1,1,1,2,2]                |
| Small Straight        | 30             | [1,2,3,4,x]                |
| 4 of a Kind           | 4 × sum        | [3,3,3,3,x]                |
| 3 of a Kind           | 3 × sum        | [3,3,3,x,x]                |
| Chance                | sum            | Any combination            |
| Ones-Sixes            | count × number | [1,1,2,3,4] for ones = 2   |

**Roll Mechanic:**

1. First roll: all 5 dice
2. Player selects which to keep
3. Second roll: non-kept dice
4. Player selects again
5. Third roll: final (must score)

**Yahtzee Bonus:**

- If Yahtzee scored and another Yahtzee rolled → +100 bonus
- Multiple Yahtzee bonuses stack

**NPC Yahtzee AI:**

```
function chooseDiceToKeep(dice, scorecard, personality) {
  // Check what hands are possible
  const possibilities = evaluateDice(dice);
  
  // Conservative: go for safe hands
  if (personality.risk < 3) {
    if (possibilities.fullHouse) return keepFullHouse(dice);
    if (possibilities.threeOfKind) return keepThreeOfKind(dice);
    return keepHighest(dice);
  }
  
  // Risky: always go for Yahtzee
  if (personality.risk > 7) {
    const mostCommon = findMostCommon(dice);
    return dice.map(d => d === mostCommon);
  }
  
  // Strategic: maximize score
  return findBestScore(dice, scorecard);
}
```

**Yahtzee Variant: Poker Yahtzee**

- All hands follow poker rules
- No scorecard, just hand rankings
- Simpler for chat/VN integration

---

### Coin Flip (Heads or Tails)

**Game State:**

```
Game ID: uuid
Player: { id, bet, choice: 'heads' | 'tails' }
Result: 'heads' | 'tails' | null
Streak: number
Payout: number
Status: waiting | flipping | resolved
```

**Coin Flip Variants:**

**Classic:**

- 50/50, payout 2x

**Double or Nothing:**

- After win, player can gamble again
- Each correct prediction doubles payout
- Lose = lose everything

**Side Bets:**

- Exact flip count before heads (1, 2, 3, 4, 5+)
- Multiple consecutive heads/tails
- Color of coin (some coins have colored edges)

**NPC Coin Flip AI:**

```
function chooseCoinSide(streak, personality) {
  // Gambler's fallacy: "tails is due"
  if (personality.gullible > 5 && streak > 2) {
    return streak > 4 ? 'heads' : 'tails';
  }
  
  // Superstitious: always heads
  if (personality.superstitious > 7) return 'heads';
  
  // Random: true coin flip
  return Math.random() < 0.5 ? 'heads' : 'tails';
}
```

**Coin Flip Animation:**

```
Frame 1: "The coin flips into the air..."
Frame 2: "It spins... spins... spins..."
Frame 3: "It lands... [reveal]"
Frame 4: "[result]! You win/lose."
```

---

### Card Draw (Higher/Lower with Cards)

**Game State:**

```
Game ID: uuid
Player: { id, bet, choice: 'higher' | 'lower' | 'suit' }
Deck: Card[] (shuffled)
Current Card: Card
Drawn Card: Card | null
Streak: number
Status: waiting | choosing | drawing | resolving | finished
```

**Card Values:**

- 2-10: face value
- J: 11
- Q: 12
- K: 13
- A: 14 (always highest)
- Suits: Spades > Hearts > Diamonds > Clubs

**Probability Table:**

| Current Card | Higher Chance | Lower Chance |
| ------------ | ------------- | ------------ |
| 2            | 77% (12/15)   | 0%           |
| 7            | 33% (5/15)    | 33% (5/15)   |
| J            | 27% (4/15)    | 33% (5/15)   |
| K            | 7% (1/15)     | 87% (13/15)  |
| A            | 0%            | 93% (14/15)  |

**Suit Prediction:**

- Correct suit: 4x payout
- Correct color: 2x payout

**Dealers Advantage:**

- After 5 correct predictions, dealer reshuffles
- Prevents card counting exploitation

---

### Dice Duels (Two-Player)

**Game State:**

```
Game ID: uuid
Player 1: { id, roll, score, diceCount }
Player 2: { id, roll, score, diceCount, isNPC }
Dice: d6 | d8 | d10 | d12 | d20
Rounds: 1 | 3 | 5
Status: waiting | rolling | resolving | finished
```

**Rolling Mechanic:**

- Both players roll simultaneously
- Higher roll wins the round
- Tie: both reroll (or both lose stake)

**Dice Count System:**

- Player with higher relationship can use more dice
- Roll sum determines damage in battle
- Critical: rolling max on all dice

**NPC Dice Duel AI:**

```
function chooseDiceCount(opponentDice, relationship, personality) {
  // Aggressive: match opponent's dice
  if (personality.aggression > 7) return opponentDice;
  
  // Conservative: use fewer dice (saves money)
  if (personality.risk < 3) return Math.max(1, opponentDice - 1);
  
  // Strategic: use one more than opponent
  return opponentDice + 1;
}
```

---

### Card Battles (Extended Poker)

**Game State:**

```
Game ID: uuid
Players: [{ id, hand: Card[], score, bet }]
Community: Card[]
Pot: number
Current Bet: number
Phase: preflop | flop | turn | river | showdown
Status: waiting | betting | showdown | finished
```

**Simplified for Chat:**

- Skip betting rounds
- Deal 2 cards to player, 5 community
- Showdown only
- Best 5-card hand wins

**Hand Rankings (Standard Poker):**

1. Royal Flush (A-K-Q-J-10 same suit) — rarest
2. Straight Flush (5 consecutive same suit)
3. Four of a Kind
4. Full House (3 + 2)
5. Flush (any 5 same suit)
6. Straight (5 consecutive)
7. Three of a Kind
8. Two Pair
9. One Pair
10. High Card

**NPC Card Battle AI:**

```
function chooseBet(handStrength, pot, opponentBet, personality) {
  const strength = evaluateHand(handStrength);
  
  // Tight player: only bet strong hands
  if (personality.patience > 7) {
    return strength > 0.7 ? opponentBet * 1.5 : 0;
  }
  
  // Loose player: bet anything decent
  if (personality.aggression > 5) {
    return strength > 0.3 ? opponentBet + Math.floor(pot * 0.1) : 0;
  }
  
  // Bluffer: bet weak hands sometimes
  if (personality.honesty < 3 && Math.random() < 0.3) {
    return opponentBet * 2;
  }
  
  return strength > 0.5 ? opponentBet : 0;
}
```

---

### Blackjack

**Game State:**

```
Game ID: uuid
Player: { id, hand: Card[], bet, status }
Dealer: { hand: Card[], hidden: boolean }
Actions: hit | stand | double | split
Status: dealing | playing | dealerTurn | finished
```

**Basic Strategy Table:**

```
Hard Hands:
  8 or less: always hit
  9-11: double if dealer shows 3-6, else hit
  12-16: stand if dealer shows 2-6, else hit
  17+: always stand

Soft Hands (with Ace):
  A-2 through A-6: double if dealer shows 3-6, else hit
  A-7: double if dealer shows 3-6, stand if 2/7/8, hit if 9-A
  A-8+: always stand
```

**Blackjack Payout:**

- Blackjack (21 with 2 cards): 3:2
- Regular win: 1:1
- Push (tie): bet returned
- Bust: lose bet

**NPC Blackjack AI:**

```
function chooseBlackjackAction(hand, dealerUpcard, personality) {
  const handValue = calculateHand(hand);
  const dealerValue = cardValue(dealerUpcard);
  
  // Basic strategy follower
  if (personality.skill > 5) {
    return basicStrategy(handValue, dealerValue, hand.length === 2);
  }
  
  // Gambler: hits too often
  if (personality.risk > 7) {
    return handValue < 18 ? 'hit' : 'stand';
  }
  
  // Chicken: stands too early
  if (personality.patience < 3) {
    return handValue >= 14 ? 'stand' : 'hit';
  }
  
  return basicStrategy(handValue, dealerValue);
}
```

**Dealer Rules:**

- Must hit on 16 or less
- Must stand on 17+ (soft 17 in some variants)
- No player options during dealer turn

---

### Trivia Quiz

**Game State:**

```
Game ID: uuid
Player: { id, score, streak }
Category: string
Questions: Question[]
Current Question: number
Time Limit: seconds
Status: waiting | answering | checking | finished
```

**Question Types:**

```
MultipleChoice {
  question: string
  options: string[4]
  correct: number
}

TrueFalse {
  question: string
  correct: boolean
}

FillBlank {
  question: string  // "The ___ of the monster is its weak point"
  answer: string
  alternatives: string[]  // ["heart", "core", "essence"]
}
```

**Scoring:**

- Base points per question: 100
- Time bonus: (timeRemaining / totalTime) × 50
- Streak bonus: streak × 25
- Category mastery: +10% per level

**Category Themes:**

- Game Lore: questions about the game world
- Character Knowledge: facts about NPCs
- Game Mechanics: how systems work
- Meta: questions about the game itself
- General Knowledge: real-world trivia

**NPC Trivia AI:**

```
function chooseTriviaAnswer(question, personality) {
  // Expert NPC: 90% accuracy
  if (personality.skill > 8) {
    return Math.random() < 0.9 ? question.correct : randomWrong(question);
  }
  
  // Average NPC: 60% accuracy
  if (personality.skill > 4) {
    return Math.random() < 0.6 ? question.correct : randomWrong(question);
  }
  
  // Bad NPC: 40% accuracy
  return Math.random() < 0.4 ? question.correct : randomWrong(question);
}
```

---

### Wheel of Fortune

**Game State:**

```
Game ID: uuid
Player: { id, bet, result }
Wheel: { segments: WheelSegment[] }
Result: { segment, multiplier, special }
Status: waiting | spinning | resolved
```

**Wheel Segments:**

```
segments: [
  { label: "2x", multiplier: 2, weight: 30 },
  { label: "3x", multiplier: 3, weight: 20 },
  { label: "5x", multiplier: 5, weight: 10 },
  { label: "JACKPOT", multiplier: 10, weight: 3 },
  { label: "BANKRUPT", multiplier: 0, weight: 5 },
  { label: "SPIN AGAIN", special: 'respin', weight: 10 },
  { label: "FREE SPIN", special: 'freespin', weight: 8 },
  { label: "1x", multiplier: 1, weight: 14 }
]
```

**Spin Animation:**

```
Frame 1: "The wheel begins to spin..."
Frame 2: "Click... click... click..."
Frame 3: "It slows down..."
Frame 4: "It lands on [result]!"
```

**NPC Wheel AI:**

- NPCs don't choose — wheel is random
- But NPCs can have "luck" stat affecting their spin
- Higher luck = better odds of landing on good segments

---

### Bingo

**Game State:**

```
Game ID: uuid
Player: { id, card: number[][] }
Numbers: number[]
Called: number[]
Pattern: 'line' | 'two_lines' | 'full_card' | 'four_corners'
Status: waiting | calling | finished
```

**Bingo Card:**

```
B  I  N  G  O
5  16  31 46 61
3  18  33 48 59
7  22  [FREE] 52 67
2  15  29 44 58
9  21  35 50 64
```

**Win Patterns:**

- Line: horizontal, vertical, or diagonal
- Two Lines: any two complete lines
- Full Card: all numbers
- Four Corners: all four corners
- X Pattern: both diagonals
- T Pattern: top row + middle column

**Auto-Daub:**

- Player can enable auto-daub
- System marks called numbers automatically
- Player still must call "BINGO" manually

---

## Cross-Reference: Existing RPG Systems

### Skill Integration

**Dice Rolling (Existing):**

- Combat: attack/defense rolls
- Skill checks: perception, lockpicking, persuasion
- Mini-games extend this with new mechanics

**Character Stats:**

```
Luck stat affects:
  - Mini-game win probability (subtle)
  - Better starting hands
  - More favorable dice rolls
  - Improved card draws

Charisma stat affects:
  - NPC betting behavior
  - Tournament entry costs
  - Social game bonuses
  - Bluff success rate

Intelligence stat affects:
  - Trivia difficulty scaling
  - Card counting accuracy
  - Pattern recognition
  - Optimal play decisions
```

**Item Integration:**

```
Items affecting mini-games:
  - Lucky Charm: +5% win rate
  - Loaded Dice: guaranteed one good roll
  - Marked Cards: see opponent's hand
  - Lucky Coin: double or nothing guaranteed
  - Cheat Sheet: trivia answers revealed
  - Poker Face: hide tells in card games
```

### Currency System

**Existing Currency:**

- Gold: primary currency
- Credits: premium currency
- Tokens: earned from mini-games

**Mini-Game Economy:**

```
Betting:
  - Min bet: 10 gold
  - Max bet: 10,000 gold (or all-in)
  - Premium games: credits only

Payouts:
  - Standard: 2x bet
  - Blackjack: 3:2
  - Yahtzee: hand value × bet
  - Trivia: difficulty × 100

Fees:
  - House takes 5% on wins over 1000
  - Tournament entry: 10% of prize pool
  - No fees on losses
```

---

## NPC Dialogue Examples

### Card Game NPC (Dealer)

**Greeting:**

```
"Welcome to the card table. I'm {name}. Let's play."
```

**After Win:**

```
"Good game. You earned that."
"Better luck next time."
"You're a skilled player."
```

**After Loss:**

```
"The cards weren't with you."
"Better luck next time."
"You owe me {amount} coins."
```

**Bluff Called:**

```
"I knew you were bluffing!"
"Your face gives it away."
"Nice try, but I saw through you."
```

**Bluff Succeeds:**

```
"You got me this time."
"That was a bold move."
"I'll remember that."
```

### Dice Game NPC (Gambler)

**Greeting:**

```
"Fancy a roll? Double or nothing?"
"Let's see who has the better luck."
"Roll the bones with me?"
```

**After Win:**

```
"Luck was on my side."
"Better luck next time, friend."
"You're on a losing streak."
```

**After Loss:**

```
"Damn! You beat me."
"I'll get you next time."
"That was a good roll."
```

### Tournament NPC (Champion)

**Pre-Match:**

```
"I'm the reigning champion. Think you can beat me?"
"I've won 10 tournaments. You're just another challenger."
"Prepare to lose."
```

**During Match:**

```
"Too slow! Make your move."
"I'm waiting..."
"You're making this too easy."
```

**Post-Match:**

```
"You actually beat me. Impressive."
"I demand a rematch!"
"You're the new champion. For now."
```

---

## Story Event Integration

### Gambling Den Scene

**Setup:**

```typescript
{
  type: 'scene',
  id: 'gambling_den',
  title: 'The Smoky Den',
  description: 'A dimly lit room filled with gamblers.',
  characters: ['dealer', 'tough_guy', 'mysterious_woman'],
  choices: [
    {
      text: 'Approach the card table',
      action: 'start_card_game',
      npc: 'dealer',
      requirements: { gold: 100 }
    },
    {
      text: 'Challenge someone to dice',
      action: 'start_dice_duel',
      npc: 'tough_guy',
      requirements: { strength: 10 }
    },
    {
      text: 'Talk to the mysterious woman',
      action: 'dialogue',
      npc: 'mysterious_woman',
      requirements: { charisma: 8 }
    }
  ]
}
```

**During Game:**

```typescript
{
  type: 'game_event',
  trigger: 'player_loses',
  scene: 'gambling_den',
  choices: [
    {
      text: 'Ask for a loan',
      action: 'loan_offer',
      requirements: { charisma: 10 },
      success: 'The dealer offers you 500 coins at 10% interest.'
    },
    {
      text: 'Leave quietly',
      action: 'leave_den'
    },
    {
      text: 'Start a fight',
      action: 'combat',
      npc: 'tough_guy'
    }
  ]
}
```

### Tournament Arc

**Story Beats:**

1. **Introduction**: NPC mentions tournament
2. **Training**: Practice games with NPC
3. **Qualifiers**: Win 3 matches to qualify
4. **Quarterfinals**: Tougher opponents
5. **Semifinals**: Rival NPC appears
6. **Finals**: Champion NPC battle
7. **Aftermath**: Rewards, reputation, story branching

**Rival NPC Integration:**

```
Beat rival → relationship improves, unlock new dialogue
Lose to rival → relationship decreases, locked out of area
Draw → neutral, can retry
```

### NPC Relationship Games

**Truth or Dare Variant:**

- Win: NPC reveals secret
- Lose: Player must answer honestly
- Draws: both reveal something

**Drinking Game:**

- NPC喝酒 → unlock drunk dialogue
- Player喝酒 → unlock drunk options
- Too much → pass out, lose time

**Gambling for Information:**

- Bet information against NPC
- Win: NPC reveals location/item/secret
- Lose: Player reveals their secret

---

## Tutorial System

### Progressive Learning

**Level 1: RPS Tutorial**

```
"You're challenged to rock-paper-scissors. This is simple:
- Rock beats Scissors
- Scissors beats Paper
- Paper beats Rock
Let's play!"
```

**Level 2: Higher/Lower Tutorial**

```
"The dealer rolled a {number}. Will it be higher or lower?
Choose wisely — wrong and you lose your bet."
```

**Level 3: Poker Tutorial**

```
"Here are your cards. The goal is to make the best 5-card hand.
I'll teach you the rankings..."
```

### Skill Checks

**Dice Rolling (existing):**

- Use for: gambling, combat, skill checks
- Mini-games extend this

**Card Games:**

- Use for: gambling, social encounters, puzzles
- Mini-games extend this

**Trivia:**

- Use for: knowledge checks, puzzle solving, social encounters
- Mini-games extend this

---

## Matchmaking

### Queue System

**Solo Queue:**

```
Player joins queue → system finds opponent → game starts
If no opponent in 30s → NPC opponent
```

**Ranked Queue:**

```
Player joins ranked queue → system finds similar ELO opponent
If no opponent in 60s → widen search
If no opponent in 120s → bot with warning
```

**Casual Queue:**

```
Player joins casual queue → instant match with anyone
No ELO impact
```

### ELO System

**Initial ELO:** 1000
**K-factor:** 32

```
ELO calculation:
  expected_A = 1 / (1 + 10^((B_elo - A_elo) / 400))
  expected_B = 1 / (1 + 10^((A_elo - B_elo) / 400))
  
  If A wins:
    A_new = A_elo + K * (1 - expected_A)
    B_new = B_elo + K * (0 - expected_B)
  
  If draw:
    A_new = A_elo + K * (0.5 - expected_A)
    B_new = B_elo + K * (0.5 - expected_B)
```

---

## Leaderboard System

### Types

**Daily Leaderboard:**

- Most wins today
- Most coins earned today
- Highest streak today

**Weekly Leaderboard:**

- Most wins this week
- Tournament wins
- Achievement points

**All-Time Leaderboard:**

- Total wins
- Highest ELO
- Most achievements
- Richest player

### Display

**Rank 1-10:**

```
🏆 #1 PlayerName - 500 wins, 10,000 ELO
🥈 #2 PlayerName - 450 wins, 9,800 ELO
🥉 #3 PlayerName - 400 wins, 9,600 ELO
4. PlayerName - 350 wins, 9,400 ELO
...
```

**Player's Position:**

```
Your rank: #42 (150 wins, 8,500 ELO)
```

---

## Seasonal/Timed Events

### Weekly Themes

**Monday: Double XP**

- All mini-games give 2x experience
- Boosted NPC payouts

**Wednesday: Tournament Day**

- Special tournament with big prizes
- Entry fee waived for first entry

**Friday: Challenge Day**

- NPC challenges with bonus rewards
- Special boss NPC appears

**Weekend: Social Bonuses**

- Multiplayer games give bonus tokens
- Friend list games give 3x rewards

### Monthly Events

**Casino Night:**

- All games have special rules
- Jackpot increased
- Limited-time achievements

**Champion's Tournament:**

- Best players compete
- Prizes for top 10
- Special cosmetic rewards

### Holiday Events

**Christmas:**

- Gift boxes from mini-games
- Special holiday-themed games
- NPC in costumes

**Halloween:**

- Spooky dice
- Ghost opponents
- Haunted casino

---

## Game Stats & Analytics

### Player Stats

```typescript
interface PlayerGameStats {
  // General
  totalGamesPlayed: number;
  totalGamesWon: number;
  winRate: number;
  favoriteGame: string;

  // Per-Game
  rps: { played: number; won: number; streak: number };
  higherLower: { played: number; won: number; streak: number };
  yahtzee: { played: number; won: number; bestScore: number };
  coinFlip: { played: number; won: number; streak: number };
  cardDraw: { played: number; won: number; streak: number };
  diceDuel: { played: number; won: number; streak: number };
  cardBattle: { played: number; won: number; streak: number };
  blackjack: { played: number; won: number; blackjacks: number };
  trivia: { played: number; won: number; accuracy: number };
  wheel: { played: number; won: number; bestMultiplier: number };
  bingo: { played: number; won: number; bestTime: number };

  // Social
  tournamentsPlayed: number;
  tournamentsWon: number;
  achievementsEarned: number;

  // Economy
  totalGoldEarned: number;
  totalGoldLost: number;
  netProfit: number;
}
```

### Global Stats

```typescript
interface GlobalGameStats {
  // Per-Game
  rps: { totalPlayed: number; totalWon: number; averageGameLength: number };
  higherLower: { totalPlayed: number; averageStreak: number };
  // ... etc

  // Popular Games
  mostPlayed: string[];
  highestWinRate: string[];

  // Economy
  totalGoldInCirculation: number;
  totalGoldEarned: number;
  totalGoldLost: number;

  // Social
  totalTournaments: number;
  totalPlayers: number;
  activePlayers: number;
}
```

---

## Social Features

### Friends List

**Invite to Game:**

```
"Invite [Friend] to play?"
[Accept] [Decline]
```

**Spectate Friend:**

```
"Watch [Friend] play?"
[Watch] [Continue]
```

**Send Gift:**

```
"Send [Friend] a gift?"
[10 Gold] [50 Gold] [100 Gold] [Custom]
```

### Chat Integration

**Game Chat:**

```
During game:
  "Good luck!"
  "Nice move!"
  "I'm going to win!"
  "Well played."
```

**Post Game:**

```
"Rematch?"
"Good game!"
"You're skilled!"
"Let's play again!"
```

### Clubs/Guilds

**Club Hall:**

```
Club Name: "Lucky Seven"
Members: 20/50
Club Level: 5
Club Treasury: 10,000 gold
```

**Club Tournaments:**

- Members compete for club ranking
- Club vs club tournaments
- Club rewards for participation

---

## Error Handling

### Common Errors

**Insufficient Funds:**

```
"You don't have enough gold. You need {amount} but have {current}."
```

**Game in Progress:**

```
"You're already in a game. Finish it first."
```

**Opponent Left:**

```
"Your opponent disconnected. You win by default."
```

**Server Error:**

```
"Something went wrong. Your bet has been refunded."
```

**Invalid Move:**

```
"That's not a valid move. Try again."
```

### Edge Cases

**Tie in Tournament:**

```
Both players have same score → sudden death round
```

**NPC Refuses Game:**

```
NPC says: "Not now. I'm busy."
Player must wait or find another NPC
```

**Achievement During Game:**

```
Show achievement notification
Continue game normally
```

---

## Sound & Visual Feedback

### Sound Effects

**Card Games:**

```
card_deal: Card hitting table
card_flip: Card turning over
chip_stack: Chips being stacked
chip_slide: Chips sliding across table
shuffle: Cards being shuffled
```

**Dice Games:**

```
dice_roll: Dice tumbling
dice_land: Dice hitting surface
dice_keep: Dice being held
```

**General:**

```
win: Victory fanfare
lose: Sad trombone
draw: Neutral sound
bet: Coins clinking
payout: Coins pouring
```

### Visual Effects

**Card Animations:**

```
deal: Card slides from deck to player
flip: Card flips face-up
shuffle: Cards animate shuffle
discard: Card slides to discard pile
```

**Dice Animations:**

```
roll: Dice tumble
land: Dice settle
glow: Winning dice glow
```

**Chip Animations:**

```
stack: Chips stack up
slide: Chips slide to pot
fly: Chips fly to winner
```

---

## Testing Strategies

### Unit Tests

**Game Logic:**

```typescript
test("rps_win", () => {
  expect(rps("rock", "scissors",),).toBe("win",);
});

test("higher_lower_correct", () => {
  expect(higherLower(5, "higher", 8,),).toBe("win",);
});

test("yahtzee_hand_ranking", () => {
  expect(yahtzeeHand([5, 5, 5, 5, 5,],),).toBe("yahtzee",);
});
```

**NPC AI:**

```typescript
test("npc_bluff_frequency", () => {
  const npc = createNPC({ honesty: 2, },);
  let bluffs = 0;
  for (let i = 0; i < 100; i++) {
    if (npc.shouldBluff()) { bluffs++; }
  }
  expect(bluffs,).toBeGreaterThan(20,); // ~30% bluff rate
});
```

### Integration Tests

**Full Game Flow:**

```typescript
test("complete_poker_game", async () => {
  const game = await createPokerGame(player1, player2,);
  await makeBet(game.id, player1.id, 100,);
  await makeBet(game.id, player2.id, 100,);
  await dealCards(game.id,);
  await makeMove(game.id, player1.id, { action: "raise", amount: 50, },);
  await makeMove(game.id, player2.id, { action: "call", },);
  await showdown(game.id,);
  expect(game.status,).toBe("finished",);
});
```

### E2E Tests

**User Journey:**

```typescript
test("new_player_tutorial", async () => {
  await login(player,);
  await startTutorial();
  await playRPS();
  await completeTutorial();
  expect(player.stats.tutorialsCompleted,).toContain("rps",);
});
```

### Performance Tests

**Load Testing:**

```typescript
test("100_concurrent_games", async () => {
  const games = await Promise.all(
    Array.from({ length: 100, }, () => createPokerGame(),),
  );
  expect(games.every(g => g.status === "active"),).toBe(true,);
});
```

---

## Implementation Priority

### Phase 1: Framework + Basic Games

1. Game state management
2. Basic UI components
3. RPS, Higher/Lower, Coin Flip
4. Chat commands
5. Basic NPC AI

### Phase 2: Advanced Games

1. Poker, Blackjack, Yahtzee
2. Tournament system
3. Advanced NPC AI
4. Achievement system

### Phase 3: Social Features

1. Friends list
2. Spectating
3. Clubs
4. Matchmaking

### Phase 4: Economy & Analytics

1. Leaderboards
2. Stats tracking
3. Seasonal events
4. Anti-exploit

---

## Open Questions

1. **Real-time vs Turn-based**: Should multiplayer be real-time or turn-based?
2. **Mobile Support**: How to handle complex UIs on mobile?
3. **Cross-platform**: Same game on web and TUI?
4. **Accessibility**: How much effort for screen reader support?
5. **Sound**: Should sound be required or optional?
6. **Multiplayer**: P2P or server-authoritative?
7. **Cheating**: How to detect and prevent?
8. **Balance**: How to keep games fair for all skill levels?

## Next Steps

1. Finalize individual game mechanics
2. Design detailed UI mockups
3. Define API contracts
4. Create test cases
5. Start implementation (Phase 1)
