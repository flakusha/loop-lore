<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Mini-Games: Database Schema Design

## Schema Overview

### Core Tables

**games** — All game instances

```sql
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Game Configuration
  game_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  options JSONB DEFAULT '{}',
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  
  -- Results
  winner_id UUID,
  result JSONB,
  
  -- Metadata
  is_ranked BOOLEAN DEFAULT TRUE,
  is_tournament BOOLEAN DEFAULT FALSE,
  tournament_id UUID,
  
  -- Indexes
  CONSTRAINT valid_status CHECK (status IN ('waiting', 'active', 'finished', 'cancelled')),
  CONSTRAINT valid_game_type CHECK (game_type IN (
    'rps', 'higherLower', 'yahtzee', 'coinFlip', 'cardDraw',
    'diceDuel', 'cardBattle', 'blackjack', 'trivia', 'wheel', 'bingo'
  ))
);

CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_games_game_type ON games(game_type);
CREATE INDEX idx_games_created_at ON games(created_at);
CREATE INDEX idx_games_tournament_id ON games(tournament_id);
```

---

**game_players** — Players in each game

```sql
CREATE TABLE game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Player State
  seat_position INTEGER,
  is_npc BOOLEAN DEFAULT FALSE,
  npc_id VARCHAR(50),
  
  -- Betting
  buy_in INTEGER NOT NULL DEFAULT 0,
  current_bet INTEGER NOT NULL DEFAULT 0,
  total_bet INTEGER NOT NULL DEFAULT 0,
  winnings INTEGER NOT NULL DEFAULT 0,
  
  -- Game State
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  hand JSONB, -- Cards/dice/etc.
  score INTEGER,
  
  -- Results
  finish_position INTEGER,
  payout INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  
  -- Indexes
  CONSTRAINT valid_player_status CHECK (status IN ('active', 'folded', 'busted', 'waiting', 'left')),
  UNIQUE(game_id, player_id)
);

CREATE INDEX idx_game_players_game_id ON game_players(game_id);
CREATE INDEX idx_game_players_player_id ON game_players(player_id);
CREATE INDEX idx_game_players_status ON game_players(status);
```

---

**game_moves** — All moves in a game (audit trail)

```sql
CREATE TABLE game_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Move Details
  move_number INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  data JSONB DEFAULT '{}',
  
  -- Result
  result JSONB,
  is_valid BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT unique_move_per_game UNIQUE(game_id, move_number)
);

CREATE INDEX idx_game_moves_game_id ON game_moves(game_id);
CREATE INDEX idx_game_moves_player_id ON game_moves(player_id);
CREATE INDEX idx_game_moves_created_at ON game_moves(created_at);
```

---

**game_chat** — Chat messages in games

```sql
CREATE TABLE game_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Message
  message TEXT NOT NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'message',
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT valid_message_type CHECK (message_type IN ('message', 'emote', 'system', 'achievement'))
);

CREATE INDEX idx_game_chat_game_id ON game_chat(game_id);
CREATE INDEX idx_game_chat_created_at ON game_chat(created_at);
```

---

**game_history** — Historical game records

```sql
CREATE TABLE game_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL,
  
  -- Summary
  game_type VARCHAR(50) NOT NULL,
  player_count INTEGER NOT NULL,
  winner_id UUID,
  
  -- Financials
  total_pot INTEGER NOT NULL,
  house_fee INTEGER NOT NULL DEFAULT 0,
  
  -- Stats
  duration_seconds INTEGER,
  total_moves INTEGER,
  
  -- Players
  players JSONB NOT NULL, -- Array of player summaries
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Partitioning by date for performance
  CONSTRAINT valid_game_history CHECK (created_at >= '2024-01-01')
);

-- Partition by month for performance
CREATE TABLE game_history_2024_01 PARTITION OF game_history
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE INDEX idx_game_history_game_type ON game_history(game_type);
CREATE INDEX idx_game_history_created_at ON game_history(created_at);
CREATE INDEX idx_game_history_winner_id ON game_history(winner_id);
```

---

## Game-Specific Tables

### RPS (Rock-Paper-Scissors)

**rps_games** — RPS-specific data

```sql
CREATE TABLE rps_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  best_of INTEGER NOT NULL DEFAULT 1,
  
  -- Player Choices
  player1_choice VARCHAR(10),
  player2_choice VARCHAR(10),
  
  -- Results
  player1_wins INTEGER NOT NULL DEFAULT 0,
  player2_wins INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  
  -- Patterns
  player1_history JSONB DEFAULT '[]',
  player2_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_rps_games_id ON rps_games(id);
```

---

### Higher/Lower Dice

**higher_lower_games** — Higher/Lower dice-specific data

```sql
CREATE TABLE higher_lower_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  dice_type VARCHAR(5) NOT NULL DEFAULT 'd6',
  allow_double_down BOOLEAN DEFAULT TRUE,
  
  -- Game State
  current_roll INTEGER,
  player_choice VARCHAR(10), -- 'higher' or 'lower'
  
  -- Streak
  streak INTEGER NOT NULL DEFAULT 0,
  max_streak INTEGER NOT NULL DEFAULT 0,
  total_rolls INTEGER NOT NULL DEFAULT 0,
  
  -- History
  roll_history JSONB DEFAULT '[]',
  choice_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_higher_lower_games_id ON higher_lower_games(id);
```

---

### Yahtzee

**yahtzee_games** — Yahtzee-specific data

```sql
CREATE TABLE yahtzee_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Player State
  dice INTEGER[] NOT NULL DEFAULT '{}',
  dice_kept BOOLEAN[] NOT NULL DEFAULT '{false,false,false,false,false}',
  rolls_left INTEGER NOT NULL DEFAULT 3,
  
  -- Scorecard
  ones INTEGER,
  twos INTEGER,
  threes INTEGER,
  fours INTEGER,
  fives INTEGER,
  sixes INTEGER,
  three_of_kind INTEGER,
  four_of_kind INTEGER,
  full_house INTEGER,
  small_straight INTEGER,
  large_straight INTEGER,
  yahtzee INTEGER,
  chance INTEGER,
  
  -- Bonuses
  upper_bonus BOOLEAN DEFAULT FALSE,
  yahtzee_bonuses INTEGER DEFAULT 0,
  
  -- Totals
  total_score INTEGER NOT NULL DEFAULT 0,
  
  -- History
  roll_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_yahtzee_games_id ON yahtzee_games(id);
```

---

### Coin Flip

**coin_flip_games** — Coin flip-specific data

```sql
CREATE TABLE coin_flip_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  allow_double_or_nothing BOOLEAN DEFAULT TRUE,
  allow_side_bets BOOLEAN DEFAULT TRUE,
  
  -- Player Choice
  player_choice VARCHAR(10), -- 'heads' or 'tails'
  
  -- Result
  result VARCHAR(10), -- 'heads' or 'tails'
  
  -- Streak
  streak INTEGER NOT NULL DEFAULT 0,
  max_streak INTEGER NOT NULL DEFAULT 0,
  
  -- Double or Nothing
  double_or_nothing_active BOOLEAN DEFAULT FALSE,
  current_multiplier INTEGER NOT NULL DEFAULT 1,
  
  -- History
  flip_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_coin_flip_games_id ON coin_flip_games(id);
```

---

### Card Draw

**card_draw_games** — Card draw-specific data

```sql
CREATE TABLE card_draw_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  deck_size INTEGER NOT NULL DEFAULT 52,
  reshuffle_after INTEGER NOT NULL DEFAULT 10,
  
  -- Deck State
  deck JSONB NOT NULL DEFAULT '[]',
  current_card JSONB,
  
  -- Player Choice
  player_choice VARCHAR(20), -- 'higher', 'lower', 'suit'
  player_suit VARCHAR(10),
  
  -- Streak
  streak INTEGER NOT NULL DEFAULT 0,
  max_streak INTEGER NOT NULL DEFAULT 0,
  cards_drawn INTEGER NOT NULL DEFAULT 0,
  
  -- History
  card_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_card_draw_games_id ON card_draw_games(id);
```

---

### Dice Duel

**dice_duel_games** — Dice duel-specific data

```sql
CREATE TABLE dice_duel_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  dice_type VARCHAR(5) NOT NULL DEFAULT 'd6',
  rounds_to_win INTEGER NOT NULL DEFAULT 3,
  
  -- Player State
  player1_dice_count INTEGER NOT NULL DEFAULT 1,
  player2_dice_count INTEGER NOT NULL DEFAULT 1,
  
  -- Current Round
  player1_roll INTEGER,
  player2_roll INTEGER,
  
  -- Results
  player1_wins INTEGER NOT NULL DEFAULT 0,
  player2_wins INTEGER NOT NULL DEFAULT 0,
  current_round INTEGER NOT NULL DEFAULT 1,
  
  -- History
  round_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_dice_duel_games_id ON dice_duel_games(id);
```

---

### Card Battle (Poker)

**card_battle_games** — Card battle-specific data

```sql
CREATE TABLE card_battle_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  game_variant VARCHAR(20) NOT NULL DEFAULT 'simplified',
  allow_bluffing BOOLEAN DEFAULT TRUE,
  
  -- Deck State
  deck JSONB NOT NULL DEFAULT '[]',
  
  -- Community Cards
  community_cards JSONB DEFAULT '[]',
  current_phase VARCHAR(20) DEFAULT 'preflop',
  
  -- Betting
  current_bet INTEGER NOT NULL DEFAULT 0,
  min_raise INTEGER NOT NULL DEFAULT 0,
  pot INTEGER NOT NULL DEFAULT 0,
  
  -- History
  betting_rounds JSONB DEFAULT '[]'
);

CREATE INDEX idx_card_battle_games_id ON card_battle_games(id);
```

---

### Blackjack

**blackjack_games** — Blackjack-specific data

```sql
CREATE TABLE blackjack_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  dealer_stands_on_soft_17 BOOLEAN DEFAULT TRUE,
  allow_double_after_split BOOLEAN DEFAULT TRUE,
  number_of_decks INTEGER NOT NULL DEFAULT 1,
  
  -- Deck State
  deck JSONB NOT NULL DEFAULT '[]',
  
  -- Dealer Hand
  dealer_hand JSONB NOT NULL DEFAULT '[]',
  dealer_hidden_card JSONB,
  
  -- Player Hands (supports split)
  player_hands JSONB NOT NULL DEFAULT '[]',
  current_hand_index INTEGER NOT NULL DEFAULT 0,
  
  -- History
  action_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_blackjack_games_id ON blackjack_games(id);
```

---

### Trivia

**trivia_games** — Trivia-specific data

```sql
CREATE TABLE trivia_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  category VARCHAR(50),
  difficulty VARCHAR(20) NOT NULL DEFAULT 'medium',
  question_count INTEGER NOT NULL DEFAULT 5,
  time_per_question INTEGER NOT NULL DEFAULT 30,
  
  -- Questions
  questions JSONB NOT NULL DEFAULT '[]',
  current_question INTEGER NOT NULL DEFAULT 0,
  
  -- Player Answers
  answers JSONB DEFAULT '[]',
  
  -- Score
  score INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_trivia_games_id ON trivia_games(id);
```

---

### Wheel of Fortune

**wheel_games** — Wheel of Fortune-specific data

```sql
CREATE TABLE wheel_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  wheel_type VARCHAR(20) NOT NULL DEFAULT 'standard',
  segments JSONB NOT NULL DEFAULT '[]',
  
  -- Result
  result_segment JSONB,
  result_multiplier INTEGER,
  result_special VARCHAR(20),
  
  -- History
  spin_history JSONB DEFAULT '[]'
);

CREATE INDEX idx_wheel_games_id ON wheel_games(id);
```

---

### Bingo

**bingo_games** — Bingo-specific data

```sql
CREATE TABLE bingo_games (
  id UUID PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  
  -- Settings
  pattern VARCHAR(20) NOT NULL DEFAULT 'line',
  card_size INTEGER NOT NULL DEFAULT 5,
  
  -- Game State
  called_numbers INTEGER[] DEFAULT '{}',
  current_number INTEGER,
  
  -- Player Cards
  player_cards JSONB NOT NULL DEFAULT '{}',
  
  -- Winners
  winners JSONB DEFAULT '[]'
);

CREATE INDEX idx_bingo_games_id ON bingo_games(id);
```

---

## Tournament Tables

**tournaments** — Tournament instances

```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Configuration
  name VARCHAR(100) NOT NULL,
  game_type VARCHAR(50) NOT NULL,
  format VARCHAR(20) NOT NULL,
  
  -- Settings
  max_players INTEGER NOT NULL,
  entry_fee INTEGER NOT NULL DEFAULT 0,
  prize_pool INTEGER NOT NULL DEFAULT 0,
  min_players INTEGER NOT NULL DEFAULT 2,
  
  -- Schedule
  registration_starts TIMESTAMP,
  registration_ends TIMESTAMP,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP,
  
  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  current_round INTEGER NOT NULL DEFAULT 0,
  total_rounds INTEGER,
  
  -- Options
  options JSONB DEFAULT '{}',
  
  -- Results
  winner_id UUID,
  results JSONB,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_tournament_status CHECK (status IN (
    'pending', 'registration', 'active', 'finished', 'cancelled'
  )),
  CONSTRAINT valid_tournament_format CHECK (format IN (
    'single_elimination', 'double_elimination', 'round_robin', 'swiss', 'free_for_all'
  ))
);

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_game_type ON tournaments(game_type);
CREATE INDEX idx_tournaments_starts_at ON tournaments(starts_at);
```

---

**tournament_players** — Tournament participants

```sql
CREATE TABLE tournament_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'registered',
  seed INTEGER,
  current_round INTEGER NOT NULL DEFAULT 0,
  
  -- Stats
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  
  -- Results
  final_position INTEGER,
  prize INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  registered_at TIMESTAMP DEFAULT NOW(),
  eliminated_at TIMESTAMP,
  
  CONSTRAINT valid_tournament_player_status CHECK (status IN (
    'registered', 'active', 'eliminated', 'winner', 'disqualified'
  )),
  UNIQUE(tournament_id, player_id)
);

CREATE INDEX idx_tournament_players_tournament_id ON tournament_players(tournament_id);
CREATE INDEX idx_tournament_players_player_id ON tournament_players(player_id);
```

---

**tournament_matches** — Tournament matches/brackets

```sql
CREATE TABLE tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  
  -- Bracket Position
  round INTEGER NOT NULL,
  bracket_position INTEGER,
  match_number INTEGER NOT NULL,
  
  -- Players
  player1_id UUID REFERENCES tournament_players(id),
  player2_id UUID REFERENCES tournament_players(id),
  winner_id UUID REFERENCES tournament_players(id),
  
  -- Game Reference
  game_id UUID REFERENCES games(id),
  
  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Results
  result JSONB,
  
  -- Timing
  scheduled_at TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  
  CONSTRAINT valid_match_status CHECK (status IN (
    'pending', 'scheduled', 'active', 'finished', 'bye', 'cancelled'
  ))
);

CREATE INDEX idx_tournament_matches_tournament_id ON tournament_matches(tournament_id);
CREATE INDEX idx_tournament_matches_round ON tournament_matches(round);
CREATE INDEX idx_tournament_matches_status ON tournament_matches(status);
```

---

## Player Stats & Progression

**player_game_stats** — Per-player game statistics

```sql
CREATE TABLE player_game_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_type VARCHAR(50) NOT NULL,
  
  -- Games
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  win_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  
  -- Streaks
  current_streak INTEGER NOT NULL DEFAULT 0,
  max_streak INTEGER NOT NULL DEFAULT 0,
  
  -- Game-Specific Stats
  stats JSONB DEFAULT '{}',
  
  -- ELO
  elo INTEGER NOT NULL DEFAULT 1000,
  peak_elo INTEGER NOT NULL DEFAULT 1000,
  
  -- Timing
  last_played_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(player_id, game_type)
);

CREATE INDEX idx_player_game_stats_player_id ON player_game_stats(player_id);
CREATE INDEX idx_player_game_stats_game_type ON player_game_stats(game_type);
CREATE INDEX idx_player_game_stats_elo ON player_game_stats(elo);
```

---

**player_achievements** — Earned achievements

```sql
CREATE TABLE player_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL,
  
  -- Progress
  progress INTEGER NOT NULL DEFAULT 0,
  max_progress INTEGER NOT NULL DEFAULT 1,
  completed BOOLEAN DEFAULT FALSE,
  
  -- Rewards
  reward_type VARCHAR(20),
  reward_amount INTEGER,
  
  -- Timing
  earned_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(player_id, achievement_id)
);

CREATE INDEX idx_player_achievements_player_id ON player_achievements(player_id);
CREATE INDEX idx_player_achievements_completed ON player_achievements(completed);
```

---

**player_achievement_progress** — Achievement progress tracking

```sql
CREATE TABLE player_achievement_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL,
  
  -- Progress
  current_value INTEGER NOT NULL DEFAULT 0,
  target_value INTEGER NOT NULL,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  
  -- Metadata
  events JSONB DEFAULT '[]',
  
  -- Timing
  last_updated TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(player_id, achievement_id)
);

CREATE INDEX idx_player_achievement_progress_player_id ON player_achievement_progress(player_id);
```

---

## Social Tables

**game_friends** — Friend relationships

```sql
CREATE TABLE game_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Stats
  games_played_together INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMP,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_friend_status CHECK (status IN ('pending', 'accepted', 'blocked')),
  UNIQUE(player_id, friend_id),
  CHECK (player_id != friend_id)
);

CREATE INDEX idx_game_friends_player_id ON game_friends(player_id);
CREATE INDEX idx_game_friends_friend_id ON game_friends(friend_id);
CREATE INDEX idx_game_friends_status ON game_friends(status);
```

---

**game_gifts** — Gift transactions

```sql
CREATE TABLE game_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Gift
  gift_type VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  message TEXT,
  
  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  claimed_at TIMESTAMP,
  
  CONSTRAINT valid_gift_type CHECK (gift_type IN ('gold', 'token', 'item')),
  CONSTRAINT valid_gift_status CHECK (status IN ('pending', 'claimed', 'expired', 'refunded'))
);

CREATE INDEX idx_game_gifts_sender_id ON game_gifts(sender_id);
CREATE INDEX idx_game_gifts_recipient_id ON game_gifts(recipient_id);
CREATE INDEX idx_game_gifts_status ON game_gifts(status);
```

---

**game_invites** — Game invitations

```sql
CREATE TABLE game_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Game
  game_id UUID REFERENCES games(id) ON DELETE SET NULL,
  game_type VARCHAR(50),
  bet_amount INTEGER,
  
  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  responded_at TIMESTAMP,
  
  CONSTRAINT valid_invite_status CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'))
);

CREATE INDEX idx_game_invites_inviter_id ON game_invites(inviter_id);
CREATE INDEX idx_game_invites_invitee_id ON game_invites(invitee_id);
CREATE INDEX idx_game_invites_status ON game_invites(status);
```

---

**game_spectators** — Spectator tracking

```sql
CREATE TABLE game_spectators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- State
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timing
  joined_at TIMESTAMP DEFAULT NOW(),
  left_at TIMESTAMP,
  
  UNIQUE(game_id, player_id)
);

CREATE INDEX idx_game_spectators_game_id ON game_spectators(game_id);
```

---

## Economy Tables

**game_transactions** — All financial transactions

```sql
CREATE TABLE game_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Participants
  player_id UUID NOT NULL REFERENCES users(id),
  game_id UUID,
  tournament_id UUID,
  
  -- Transaction
  transaction_type VARCHAR(30) NOT NULL,
  amount INTEGER NOT NULL,
  
  -- Balance
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  
  -- Metadata
  description TEXT,
  reference_id UUID,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_transaction_type CHECK (transaction_type IN (
    'bet', 'payout', 'refund', 'fee', 'gift_send', 'gift_receive',
    'tournament_entry', 'tournament_prize', 'achievement_reward',
    'daily_bonus', 'streak_bonus', 'penalty'
  ))
);

CREATE INDEX idx_game_transactions_player_id ON game_transactions(player_id);
CREATE INDEX idx_game_transactions_game_id ON game_transactions(game_id);
CREATE INDEX idx_game_transactions_created_at ON game_transactions(created_at);
CREATE INDEX idx_game_transactions_type ON game_transactions(transaction_type);
```

---

**game_wallets** — Player wallets

```sql
CREATE TABLE game_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Balances
  gold INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  
  -- Limits
  daily_gold_limit INTEGER NOT NULL DEFAULT 10000,
  daily_tokens_limit INTEGER NOT NULL DEFAULT 100,
  daily_gold_earned INTEGER NOT NULL DEFAULT 0,
  daily_tokens_earned INTEGER NOT NULL DEFAULT 0,
  
  -- Cooldowns
  last_game_at TIMESTAMP,
  can_play_at TIMESTAMP,
  
  -- Timing
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT positive_gold CHECK (gold >= 0),
  CONSTRAINT positive_tokens CHECK (tokens >= 0),
  UNIQUE(player_id)
);

CREATE INDEX idx_game_wallets_player_id ON game_wallets(player_id);
```

---

**game_daily_limits** — Daily limit tracking

```sql
CREATE TABLE game_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Counts
  games_played INTEGER NOT NULL DEFAULT 0,
  bets_made INTEGER NOT NULL DEFAULT 0,
  tournaments_joined INTEGER NOT NULL DEFAULT 0,
  
  -- Amounts
  total_bet INTEGER NOT NULL DEFAULT 0,
  total_won INTEGER NOT NULL DEFAULT 0,
  total_lost INTEGER NOT NULL DEFAULT 0,
  
  -- Timing
  first_game_at TIMESTAMP,
  last_game_at TIMESTAMP,
  
  UNIQUE(player_id, date)
);

CREATE INDEX idx_game_daily_limits_player_date ON game_daily_limits(player_id, date);
```

---

## Rate Limiting

**game_rate_limits** — Rate limit tracking

```sql
CREATE TABLE game_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Window
  window_start TIMESTAMP NOT NULL,
  window_duration INTERVAL NOT NULL DEFAULT '1 hour',
  
  -- Counts
  games_created INTEGER NOT NULL DEFAULT 0,
  moves_made INTEGER NOT NULL DEFAULT 0,
  chats_sent INTEGER NOT NULL DEFAULT 0,
  invites_sent INTEGER NOT NULL DEFAULT 0,
  
  -- Penalties
  warnings INTEGER NOT NULL DEFAULT 0,
  suspended_until TIMESTAMP,
  
  UNIQUE(player_id, window_start)
);

CREATE INDEX idx_game_rate_limits_player_id ON game_rate_limits(player_id);
CREATE INDEX idx_game_rate_limits_window ON game_rate_limits(window_start);
```

---

## Anti-Exploit Tables

**game_suspicious_activity** — Suspicious activity reports

```sql
CREATE TABLE game_suspicious_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Report
  reporter_id UUID REFERENCES users(id),
  game_id UUID REFERENCES games(id),
  reported_player_id UUID REFERENCES users(id),
  
  -- Details
  activity_type VARCHAR(30) NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '[]',
  
  -- State
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  resolution TEXT,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_activity_type CHECK (activity_type IN (
    'collusion', 'botting', 'exploit', 'cheating', 'other'
  )),
  CONSTRAINT valid_report_status CHECK (status IN (
    'pending', 'investigating', 'confirmed', 'dismissed', 'punished'
  ))
);

CREATE INDEX idx_game_suspicious_activity_status ON game_suspicious_activity(status);
CREATE INDEX idx_game_suspicious_activity_game_id ON game_suspicious_activity(game_id);
```

---

**game_penalties** — Player penalties

```sql
CREATE TABLE game_penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Penalty
  penalty_type VARCHAR(30) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  
  -- Duration
  starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP,
  
  -- Impact
  games_banned INTEGER NOT NULL DEFAULT 0,
  gold_confiscated INTEGER NOT NULL DEFAULT 0,
  elo_reduction INTEGER NOT NULL DEFAULT 0,
  
  -- State
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Timing
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_penalty_type CHECK (penalty_type IN (
    'warning', 'temporary_ban', 'permanent_ban', 'gold_confiscation',
    'elo_reduction', 'achievement_removal'
  )),
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX idx_game_penalties_player_id ON game_penalties(player_id);
CREATE INDEX idx_game_penalties_is_active ON game_penalties(is_active);
```

---

## Leaderboard Tables

**leaderboards** — Cached leaderboard data

```sql
CREATE TABLE leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Configuration
  leaderboard_type VARCHAR(20) NOT NULL,
  stat VARCHAR(30) NOT NULL,
  game_type VARCHAR(50),
  
  -- Data
  entries JSONB NOT NULL DEFAULT '[]',
  
  -- Timing
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  
  CONSTRAINT valid_leaderboard_type CHECK (leaderboard_type IN (
    'daily', 'weekly', 'monthly', 'all_time'
  )),
  CONSTRAINT valid_stat CHECK (stat IN (
    'wins', 'earnings', 'elo', 'achievements', 'win_rate', 'streak'
  ))
);

CREATE INDEX idx_leaderboards_type_stat ON leaderboards(leaderboard_type, stat);
CREATE INDEX idx_leaderboards_expires_at ON leaderboards(expires_at);
```

---

## Analytics Tables

**game_analytics** — Aggregated analytics

```sql
CREATE TABLE game_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dimensions
  date DATE NOT NULL,
  game_type VARCHAR(50),
  hour INTEGER,
  
  -- Metrics
  games_played INTEGER NOT NULL DEFAULT 0,
  unique_players INTEGER NOT NULL DEFAULT 0,
  total_bets INTEGER NOT NULL DEFAULT 0,
  total_payouts INTEGER NOT NULL DEFAULT 0,
  house_profit INTEGER NOT NULL DEFAULT 0,
  average_game_duration DECIMAL(10,2),
  average_players_per_game DECIMAL(5,2),
  
  -- Player Metrics
  new_players INTEGER NOT NULL DEFAULT 0,
  returning_players INTEGER NOT NULL DEFAULT 0,
  
  -- Performance
  p95_latency_ms INTEGER,
  error_rate DECIMAL(5,4),
  
  -- Timing
  calculated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(date, game_type, hour)
);

CREATE INDEX idx_game_analytics_date ON game_analytics(date);
CREATE INDEX idx_game_analytics_game_type ON game_analytics(game_type);
```

---

**game_performance** — Performance monitoring

```sql
CREATE TABLE game_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Metric
  metric_name VARCHAR(50) NOT NULL,
  metric_value DECIMAL(10,4) NOT NULL,
  
  -- Context
  game_type VARCHAR(50),
  endpoint VARCHAR(100),
  
  -- Timing
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Metadata
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_game_performance_metric ON game_performance(metric_name);
CREATE INDEX idx_game_performance_recorded_at ON game_performance(recorded_at);
```

---

## Views

**active_games_view** — Currently active games

```sql
CREATE VIEW active_games_view AS
SELECT 
  g.id,
  g.game_type,
  g.status,
  g.created_at,
  g.started_at,
  COUNT(gp.id) as player_count,
  SUM(gp.current_bet) as total_bets,
  g.options
FROM games g
JOIN game_players gp ON g.id = gp.game_id
WHERE g.status IN ('waiting', 'active')
GROUP BY g.id;

CREATE INDEX idx_active_games_view_game_type ON active_games_view(game_type);
```

---

**player_summary_view** — Player game summary

```sql
CREATE VIEW player_summary_view AS
SELECT
  p.id as player_id,
  p.username,
  COUNT(DISTINCT gh.id) as total_games,
  COUNT(DISTINCT CASE WHEN gh.winner_id = p.id THEN gh.id END) as games_won,
  ROUND(
    COUNT(DISTINCT CASE WHEN gh.winner_id = p.id THEN gh.id END)::DECIMAL / 
    NULLIF(COUNT(DISTINCT gh.id), 0) * 100, 2
  ) as win_rate,
  SUM(gh.total_pot) as total_volume,
  MAX(pgs.elo) as highest_elo
FROM users p
LEFT JOIN game_history gh ON p.id = gh.winner_id OR p.id = ANY(
  SELECT jsonb_array_elements_text(gh.players->'$[*].player_id')::UUID
)
LEFT JOIN player_game_stats pgs ON p.id = pgs.player_id
GROUP BY p.id, p.username;

CREATE INDEX idx_player_summary_view_player_id ON player_summary_view(player_id);
```

---

## Migration Scripts

### Initial Migration

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create all tables
-- (Run each CREATE TABLE statement above)

-- Create indexes
-- (Run each CREATE INDEX statement above)

-- Create views
-- (Run each CREATE VIEW statement above)
```

### Partition Management

```sql
-- Create monthly partitions
CREATE OR REPLACE FUNCTION create_game_history_partition()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
BEGIN
  partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  partition_name := 'game_history_' || TO_CHAR(partition_date, 'YYYY_MM');
  
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF game_history FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    partition_date,
    partition_date + INTERVAL '1 month'
  );
END;
$$ LANGUAGE plpgsql;

-- Schedule monthly partition creation
SELECT cron.schedule('create-partition', '0 0 1 * *', 'SELECT create_game_history_partition()');
```

---

## Index Strategy

### Composite Indexes

```sql
-- Games by status and type
CREATE INDEX idx_games_status_type ON games(status, game_type);

-- Player stats by game type and ELO
CREATE INDEX idx_player_game_stats_type_elo ON player_game_stats(game_type, elo DESC);

-- Tournament by status and start time
CREATE INDEX idx_tournaments_status_start ON tournaments(status, starts_at);

-- Transactions by player and type
CREATE INDEX idx_game_transactions_player_type ON game_transactions(player_id, transaction_type);

-- Daily limits by player and date
CREATE INDEX idx_game_daily_limits_player_date ON game_daily_limits(player_id, date DESC);
```

### Partial Indexes

```sql
-- Only active games
CREATE INDEX idx_games_active ON games(id) WHERE status = 'active';

-- Only pending tournaments
CREATE INDEX idx_tournaments_pending ON tournaments(id) WHERE status = 'pending';

-- Only active penalties
CREATE INDEX idx_game_penalties_active ON game_penalties(id) WHERE is_active = true;
```

---

## Data Retention

### Partition Rotation

```sql
-- Keep game_history for 12 months
-- Drop old partitions
CREATE OR REPLACE FUNCTION drop_old_game_history_partitions()
RETURNS void AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
BEGIN
  FOR i IN 0..12 LOOP
    partition_date := DATE_TRUNC('month', NOW() - (i || ' months')::INTERVAL);
    partition_name := 'game_history_' || TO_CHAR(partition_date, 'YYYY_MM');
    
    EXECUTE FORMAT('DROP TABLE IF EXISTS %I', partition_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### Archival

```sql
-- Archive old games to separate table
CREATE TABLE game_history_archive AS
SELECT * FROM game_history
WHERE created_at < NOW() - INTERVAL '2 years';

-- Delete from main table
DELETE FROM game_history
WHERE created_at < NOW() - INTERVAL '2 years';
```

---

## Next Steps

1. **Review Schema** — Validate with team
2. **Create Migration** — Write migration scripts
3. **Test Schema** — Load test with sample data
4. **Optimize** — Analyze query performance
5. **Document** — API documentation
6. **Implement** — Start Phase 1 games
