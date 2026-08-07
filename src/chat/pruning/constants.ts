import type { PruningConfig, PruningStrategy, } from "./types";

/** Keywords that signal high-importance content */
export const LORE_KEYWORDS = ["lore", "backstory", "history", "legend", "myth", "prophecy", "secret", "revelation",];
export const DECISION_KEYWORDS = ["decide", "decided", "choose", "chose", "agreement", "promise", "vow", "oath",];
export const EMOTION_KEYWORDS = [
  "feel",
  "feeling",
  "emotion",
  "love",
  "hate",
  "fear",
  "anger",
  "joy",
  "sadness",
  "desire",
];
export const LORE_CONTENT_KEYWORDS = ["world", "realm", "kingdom", "empire", "city", "village", "castle", "temple",];

/** Weights for each scoring factor (must sum to 1.0) */
export const SCORING_WEIGHTS = {
  recency: 0.3,
  role: 0.2,
  keywords: 0.2,
  memoryLinks: 0.15,
  attachments: 0.1,
  reactions: 0.05,
} as const;

/** Default configuration (balanced) */
export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  strategy: "balanced",
  keepThreshold: 0.3,
  promoteThreshold: 0.6,
  targetTokens: 20_000,
  insertSummary: true,
};

/** Strategy-specific overrides */
export const STRATEGY_CONFIGS: Record<PruningStrategy, Partial<PruningConfig>> = {
  aggressive: { keepThreshold: 0.4, promoteThreshold: 0.7, },
  conservative: { keepThreshold: 0.2, promoteThreshold: 0.5, },
  balanced: { keepThreshold: 0.3, promoteThreshold: 0.6, },
};
