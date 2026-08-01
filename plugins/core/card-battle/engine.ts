/**
 * Card Battle Engine
 *
 * Deck management, card comparison logic, damage calculation,
 * battle state machine, and action modifier resolution.
 */

import type {
  Card,
  Suit,
  Rank,
  DeckState,
  CombatCardAction,
  CardOutcome,
  CardBattleState,
  CardBattleRound,
} from "./types";

// ── Constants ─────────────────────────────────────────────────

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

const RANK_VALUES: Record<Rank, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, J: 11, Q: 12, K: 13, A: 14,
};

/** Action modifiers affect effective card value */
const ACTION_MODIFIERS: Record<CombatCardAction, {
  /** Flat value added to player card */
  valueMod: number;
  /** Multiplier for effect value on hit */
  effectMod: number;
  /** Description for narrative */
  desc: string;
}> = {
  attack:  { valueMod: 0,  effectMod: 1.5, desc: "slashes with" },
  defend:  { valueMod: 3,  effectMod: 0.5, desc: "blocks with" },
  feint:   { valueMod: -2, effectMod: 2.0, desc: "feints with" },
  bluff:   { valueMod: 0,  effectMod: 1.0, desc: "bluffs with" },
  charm:   { valueMod: 1,  effectMod: 0.8, desc: "charms with" },
};

/** Opponent names for narrative */
const OPPONENT_NAMES = ["the bandit", "the rogue", "the rival", "the stranger"];

// ── RNG ───────────────────────────────────────────────────────

function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

// ── Deck Management ───────────────────────────────────────────

/** Create a standard 52-card deck */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank, value: RANK_VALUES[rank] });
    }
  }
  return cards;
}

/** Shuffle a deck using Fisher-Yates with crypto RNG */
export function shuffleDeck(cards: Card[]): Card[] {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = cryptoRandom(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Initialize deck state with a freshly shuffled 52-card deck */
export function initDeckState(): DeckState {
  const deck = shuffleDeck(createDeck());
  return {
    remaining: deck,
    discarded: [],
    total: deck.length,
  };
}

/** Draw cards from deck. Auto-reshuffles discard when empty. */
export function drawCards(deck: DeckState, count: number): Card[] {
  const drawn: Card[] = [];

  for (let i = 0; i < count; i++) {
    // Reshuffle discard into remaining if needed
    if (deck.remaining.length === 0) {
      if (deck.discarded.length === 0) break; // No cards left at all
      deck.remaining = shuffleDeck(deck.discarded);
      deck.discarded = [];
    }
    const card = deck.remaining.pop()!;
    drawn.push(card);
  }

  return drawn;
}

/** Return cards to discard pile */
export function discardCards(deck: DeckState, cards: Card[]): void {
  deck.discarded.push(...cards);
}

// ── Card Comparison ───────────────────────────────────────────

/**
 * Compare two cards. Returns base outcome before action modifiers.
 * Higher card value wins; ties go to suit order (spades > hearts > diamonds > clubs).
 */
const SUIT_ORDER: Record<Suit, number> = {
  spades: 4, hearts: 3, diamonds: 2, clubs: 1,
};

export function compareCards(playerCard: Card, opponentCard: Card): CardOutcome {
  if (playerCard.value > opponentCard.value) return "win";
  if (playerCard.value < opponentCard.value) return "lose";

  // Tie-break by suit
  const playerSuit = SUIT_ORDER[playerCard.suit];
  const opponentSuit = SUIT_ORDER[opponentCard.suit];
  if (playerSuit > opponentSuit) return "win";
  if (playerSuit < opponentSuit) return "lose";

  // True draw — both same value and suit edge case shouldn't happen
  return "draw";
}

// ── Damage Calculation ────────────────────────────────────────

/**
 * Calculate damage for a round. Uses card value as base, modified by action.
 *
 * @param cardValue  The winning card's numeric value
 * @param action     The combat action used
 * @param outcome    The round outcome
 * @param critical   Whether this is a critical hit
 */
export function calculateDamage(
  cardValue: number,
  action: CombatCardAction,
  outcome: CardOutcome,
  critical: boolean,
): number {
  const mod = ACTION_MODIFIERS[action];
  let base = cardValue * mod.effectMod;

  if (critical) base *= 2;
  if (outcome === "win") return Math.max(1, Math.round(base));
  if (outcome === "critical_win") return Math.max(1, Math.round(base * 1.5));
  return 0;
}

// ── Battle Narrative ──────────────────────────────────────────

function pickOpponentName(): string {
  return OPPONENT_NAMES[cryptoRandom(OPPONENT_NAMES.length)];
}

function buildRoundNarrative(
  playerCard: Card,
  opponentCard: Card,
  action: CombatCardAction,
  outcome: CardOutcome,
  damage: number,
  opponentName: string,
): string {
  const mod = ACTION_MODIFIERS[action];
  const pCard = `${playerCard.rank}${playerCard.suit === "hearts" ? "♥" : playerCard.suit === "diamonds" ? "♦" : playerCard.suit === "clubs" ? "♣" : "♠"}`;
  const oCard = `${opponentCard.rank}${opponentCard.suit === "hearts" ? "♥" : opponentCard.suit === "diamonds" ? "♦" : opponentCard.suit === "clubs" ? "♣" : "♠"}`;

  const playerLine = `You ${mod.desc} ${pCard}`;
  const opponentLine = `${opponentName} plays ${oCard}`;

  switch (outcome) {
    case "critical_win":
      return `${playerLine}! Critical hit! ${opponentLine} stands no chance. ${damage} damage!`;
    case "win":
      return `${playerLine}. ${opponentLine}. You deal ${damage} damage!`;
    case "draw":
      return `${playerLine}. ${opponentLine}. Cards match — no damage dealt.`;
    case "lose":
      return `${playerLine}, but ${opponentLine} overpowers you. You take ${damage} damage!`;
    case "critical_lose":
      return `${playerLine}, but ${counterLine(opponentName)}! Critical hit against you. ${damage} damage!`;
  }
}

function counterLine(name: string): string {
  const lines = [
    `${name} counters devastatingly`,
    `${name} finds your weakness`,
    `${name} exploits your opening`,
  ];
  return lines[cryptoRandom(lines.length)];
}

// ── Battle State Machine ──────────────────────────────────────

/** Difficulty → opponent hand size and card value boost */
const DIFFICULTY_CONFIG = {
  easy:   { handSize: 3, valueBoost: 0 },
  medium: { handSize: 4, valueBoost: 1 },
  hard:   { handSize: 5, valueBoost: 2 },
} as const;

/** Initialize a new card battle */
export function initBattle(
  playerHp = 100,
  difficulty: "easy" | "medium" | "hard" = "medium",
  handSize = 5,
): CardBattleState {
  const deck = initDeckState();
  const config = DIFFICULTY_CONFIG[difficulty];

  return {
    playerHp,
    playerMaxHp: playerHp,
    opponentHp: playerHp,
    opponentMaxHp: playerHp,
    playerHand: drawCards(deck, handSize),
    opponentHandSize: config.handSize,
    deck,
    rounds: [],
    finished: false,
    winner: null,
    currentRound: 0,
  };
}

/**
 * Play a card from the player's hand against the opponent.
 * Opponent plays the highest card in their hand (simple AI).
 */
export function playBattleCard(
  state: CardBattleState,
  cardIndex: number,
  action: CombatCardAction,
): CardBattleRound {
  if (state.finished) throw new Error("Battle is already finished");
  if (cardIndex < 0 || cardIndex >= state.playerHand.length) {
    throw new Error(`Invalid card index ${cardIndex}. Hand has ${state.playerHand.length} cards.`);
  }

  // Player plays chosen card
  const playerCard = state.playerHand.splice(cardIndex, 1)[0];

  // Opponent draws and plays the highest card
  if (state.deck.remaining.length + state.deck.discarded.length > 0) {
    const opponentDraw = drawCards(state.deck, 1);
    if (opponentDraw.length > 0) {
      const opponentCard = opponentDraw[0];

      // Apply action modifier to effective comparison
      const actionMod = ACTION_MODIFIERS[action];
      const effectiveValue = playerCard.value + actionMod.valueMod;

      // Determine outcome
      let outcome: CardOutcome;
      if (effectiveValue > opponentCard.value) {
        // Critical win: natural high card + offensive action
        outcome = playerCard.value >= 12 && (action === "attack" || action === "feint")
          ? "critical_win"
          : "win";
      } else if (effectiveValue < opponentCard.value) {
        outcome = opponentCard.value >= 12 && action !== "defend"
          ? "critical_lose"
          : "lose";
      } else {
        outcome = "draw";
      }

      // Calculate damage
      const isCritical = outcome === "critical_win" || outcome === "critical_lose";
      const winnerValue = outcome.includes("win") ? playerCard.value : opponentCard.value;
      const damage = calculateDamage(winnerValue, action, outcome, isCritical);

      // Apply damage
      if (outcome === "win" || outcome === "critical_win") {
        state.opponentHp = Math.max(0, state.opponentHp - damage);
      } else if (outcome === "lose" || outcome === "critical_lose") {
        state.playerHp = Math.max(0, state.playerHp - damage);
      }

      // Discard both cards
      discardCards(state.deck, [playerCard, opponentCard]);

      // Draw a replacement card for the player
      const [newCard] = drawCards(state.deck, 1);
      if (newCard) state.playerHand.push(newCard);

      // Build round
      state.currentRound++;
      const opponentName = pickOpponentName();
      const round: CardBattleRound = {
        round: state.currentRound,
        playerCard,
        opponentCard,
        action,
        outcome,
        effectValue: damage,
        narrative: buildRoundNarrative(playerCard, opponentCard, action, outcome, damage, opponentName),
      };
      state.rounds.push(round);

      // Check win conditions
      if (state.playerHp <= 0 && state.opponentHp <= 0) {
        state.finished = true;
        state.winner = "draw";
      } else if (state.opponentHp <= 0) {
        state.finished = true;
        state.winner = "player";
      } else if (state.playerHp <= 0) {
        state.finished = true;
        state.winner = "opponent";
      } else if (state.playerHand.length === 0) {
        // Out of cards — compare HP
        state.finished = true;
        state.winner = state.playerHp > state.opponentHp
          ? "player"
          : state.playerHp < state.opponentHp
            ? "opponent"
            : "draw";
      }

      return round;
    }
  }

  // No cards left to draw — shouldn't happen with standard deck
  state.finished = true;
  state.winner = state.playerHp > state.opponentHp ? "player" : "draw";
  discardCards(state.deck, [playerCard]);
  state.currentRound++;
  return {
    round: state.currentRound,
    playerCard,
    opponentCard: { suit: "clubs", rank: "2", value: 2 },
    action,
    outcome: "draw",
    effectValue: 0,
    narrative: "No cards remain. The battle ends in a stalemate.",
  };
}

/** Card display helper */
export function cardToString(card: Card): string {
  const suitSymbol = card.suit === "hearts" ? "♥"
    : card.suit === "diamonds" ? "♦"
    : card.suit === "clubs" ? "♣"
    : "♠";
  return `${card.rank}${suitSymbol}`;
}