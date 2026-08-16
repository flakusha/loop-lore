// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Card Game Engine
 *
 * Seduction card mechanics: draw cards, play against target resistance,
 * track intimacy escalation, and resolve NSFW event outcomes.
 * Integrates with reputation system via intimacy thresholds.
 */

import type {
  SeductionCard,
  SeductionCardType,
  SeductionOutcome,
  SeductionRound,
  SeductionState,
} from "./types";

// ── Card Pool ─────────────────────────────────────────────────

const CARD_TEMPLATES: { type: SeductionCardType; names: string[]; desc: string[] }[] = [
  {
    type: "flirt",
    names: ["Cheeky Grin", "Wink", "Sly Smile", "Playful Tease"],
    desc: ["Flash a disarming smile", "Let your eyes do the talking", "A playful look that says everything"],
  },
  {
    type: "charm",
    names: ["Silver Tongue", "Sweet Words", "Poetic Flattery", "Enchanting Compliment"],
    desc: ["Words like honey", "Whisper something irresistible", "Speak from the heart"],
  },
  {
    type: "tease",
    names: ["Just Out of Reach", "Tantalizing Promise", "Forbidden Fruit", "Barely There"],
    desc: ["Leave them wanting more", "A glimpse of what's possible", "Temptation in motion"],
  },
  {
    type: "compliment",
    names: ["You're Stunning", "Can't Look Away", "Heart Skip", "Breathless"],
    desc: ["Genuine admiration", "A compliment that lands perfectly", "Make them blush"],
  },
  {
    type: "touch",
    names: ["Gentle Caress", "Electric Contact", "Warm Embrace", "Guiding Hand"],
    desc: ["A light touch on the arm", "Feel the spark", "Close the distance"],
  },
  {
    type: "kiss",
    names: ["First Kiss", "Stolen Moment", "Lingering Taste", "Passionate Press"],
    desc: ["Seal the deal", "A moment of pure connection", "Lips meet and time stops"],
  },
];

// ── Constants ─────────────────────────────────────────────────

const POWER_BY_TYPE: Record<SeductionCardType, [number, number]> = {
  flirt: [1, 3],
  charm: [2, 4],
  tease: [1, 3],
  compliment: [1, 3],
  touch: [2, 4],
  kiss: [3, 5],
};

const DIFFICULTY_CONFIG = {
  easy:   { targetIntimacy: 50, maxResistance: 30, maxRounds: 8 },
  medium: { targetIntimacy: 70, maxResistance: 50, maxRounds: 7 },
  hard:   { targetIntimacy: 85, maxResistance: 70, maxRounds: 6 },
} as const;

const RESPONSE_NARRATIVES: Record<SeductionOutcome, string[]> = {
  succeed: [
    "They lean into your touch, eyes softening.",
    "A blush creeps across their cheeks as they smile.",
    "Their breath catches — you've got their attention.",
    "They mirror your energy, drawn closer.",
  ],
  partial: [
    "They seem interested but hold back a little.",
    "A flicker of desire, quickly masked.",
    "They smile, but there's still a wall up.",
  ],
  fail: [
    "They pull back slightly, not ready for that.",
    "The moment passes without impact.",
    "They deflect with a nervous laugh.",
    "Too much, too fast — they retreat a step.",
  ],
};

// ── RNG ───────────────────────────────────────────────────────

function cryptoRandom(max: number): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
}

function pick<T>(arr: T[]): T {
  return arr[cryptoRandom(arr.length)];
}

function cryptoFloat(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0xffffffff;
}

// ── Card Generation ───────────────────────────────────────────

function generateCard(): SeductionCard {
  const template = pick(CARD_TEMPLATES);
  const [minPower, maxPower] = POWER_BY_TYPE[template.type];
  const power = minPower + cryptoRandom(maxPower - minPower + 1);

  return {
    type: template.type,
    power,
    name: pick(template.names),
    description: pick(template.desc),
  };
}

function generateHand(size: number): SeductionCard[] {
  const hand: SeductionCard[] = [];
  // Ensure variety: at most 2 of same type
  const typeCounts = new Map<SeductionCardType, number>();
  for (let i = 0; i < size; i++) {
    let card: SeductionCard;
    let attempts = 0;
    do {
      card = generateCard();
      attempts++;
    } while ((typeCounts.get(card.type) || 0) >= 2 && attempts < 20);
    hand.push(card);
    typeCounts.set(card.type, (typeCounts.get(card.type) || 0) + 1);
  }
  // Sort by power descending for UX
  hand.sort((a, b) => b.power - a.power);
  return hand;
}

// ── Outcome Resolution ────────────────────────────────────────

/**
 * Resolve a seduction card play against target resistance.
 *
 * Higher card power vs resistance gap → better outcome.
 * Intimacy gained scales with power and outcome.
 */
function resolveRound(
  card: SeductionCard,
  resistance: number,
  intimacy: number,
): { outcome: SeductionOutcome; intimacyChange: number; responseStrength: number } {
  // Effective power modified by card type
  const typeBonus = card.type === "kiss" ? 2
    : card.type === "touch" ? 1
    : card.type === "charm" ? 1
    : 0;

  const effectivePower = card.power + typeBonus;

  // Resistance scales down to match roll range; decreases as intimacy rises
  const effectiveResistance = Math.max(1, Math.floor(resistance / 5) - Math.floor(intimacy / 25));

  // Roll range: 0-10 + 1.5-10.5 = 1.5-20.5
  const roll = cryptoFloat() * 10 + effectivePower * 1.5;
  const threshold = effectiveResistance;

  let outcome: SeductionOutcome;
  if (roll > threshold + 3) {
    outcome = "succeed";
  } else if (roll > threshold - 1) {
    outcome = "partial";
  } else {
    outcome = "fail";
  }

  // Intimacy change based on outcome and card power
  const baseChange = {
    succeed: 8 + card.power * 2,
    partial: 3 + card.power,
    fail: -1,
  }[outcome];

  // Clamp intimacy change
  const intimacyChange = Math.max(-5, Math.min(25, baseChange));

  const responseStrength = outcome === "succeed" ? 4 + cryptoRandom(2)
    : outcome === "partial" ? 2 + cryptoRandom(2)
    : 1 + cryptoRandom(2);

  return { outcome, intimacyChange, responseStrength };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Initialize a seduction encounter.
 */
export function initSeduction(
  difficulty: "easy" | "medium" | "hard" = "medium",
  handSize = 5,
): SeductionState {
  const config = DIFFICULTY_CONFIG[difficulty];
  return {
    intimacy: 0,
    targetIntimacy: config.targetIntimacy,
    resistance: config.maxResistance,
    maxResistance: config.maxResistance,
    hand: generateHand(handSize),
    rounds: [],
    finished: false,
    outcome: null,
    currentRound: 0,
    maxRounds: config.maxRounds,
  };
}

/**
 * Play a seduction card.
 *
 * @param state     Seduction state (mutated)
 * @param cardIndex Index of card in hand
 */
export function playSeductionCard(
  state: SeductionState,
  cardIndex: number,
): SeductionRound {
  if (state.finished) throw new Error("Encounter is already finished");
  if (cardIndex < 0 || cardIndex >= state.hand.length) {
    throw new Error(`Invalid card index ${cardIndex}. Hand has ${state.hand.length} cards.`);
  }

  const card = state.hand.splice(cardIndex, 1)[0];
  const result = resolveRound(card, state.resistance, state.intimacy);

  state.intimacy = Math.max(0, Math.min(100, state.intimacy + result.intimacyChange));
  state.resistance = Math.max(0, state.maxResistance - Math.floor(state.intimacy * 0.6));

  state.currentRound++;
  const narrative = pick(RESPONSE_NARRATIVES[result.outcome]);

  const round: SeductionRound = {
    round: state.currentRound,
    card,
    responseStrength: result.responseStrength,
    outcome: result.outcome,
    intimacyChange: result.intimacyChange,
    narrative,
  };
  state.rounds.push(round);

  // Check win/lose conditions
  if (state.intimacy >= state.targetIntimacy) {
    state.finished = true;
    state.outcome = "succeed";
  } else if (state.currentRound >= state.maxRounds && state.intimacy < state.targetIntimacy) {
    state.finished = true;
    state.outcome = "fail";
  } else if (state.hand.length === 0) {
    state.finished = true;
    state.outcome = state.intimacy >= state.targetIntimacy ? "succeed" : "fail";
  }

  return round;
}

/** Card display helper */
export function cardToString(card: SeductionCard): string {
  const symbols: Record<SeductionCardType, string> = {
    flirt: "😏",
    charm: "✨",
    tease: "💋",
    compliment: "💕",
    touch: "🤝",
    kiss: "😘",
  };
  return `${symbols[card.type]} ${card.name} (${card.power})`;
}