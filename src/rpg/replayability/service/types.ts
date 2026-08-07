/** New game plus difficulty modifiers */
export const PlusDifficulty = {
  Normal: "normal",
  Hard: "hard",
  Nightmare: "nightmare",
  Custom: "custom",
} as const;
export type PlusDifficulty = (typeof PlusDifficulty)[keyof typeof PlusDifficulty];

/** Ending types */
export const EndingType = {
  Good: "good",
  Neutral: "neutral",
  Bad: "bad",
  Secret: "secret",
  True: "true",
} as const;
export type EndingType = (typeof EndingType)[keyof typeof EndingType];

/** Playthrough data */
export interface Playthrough {
  id: string;
  playerId: string;
  worldId: string;
  playthroughNumber: number;
  difficulty: PlusDifficulty;
  isCompleted: boolean;
  endingId: string | null;
  endingType: EndingType | null;
  completionTime: number; // seconds
  choicesMade: number;
  secretsFound: number;
  achievementsUnlocked: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/** Ending definition */
export interface Ending {
  id: string;
  name: string;
  description: string;
  type: EndingType;
  conditions: EndingCondition[];
  rewards: EndingReward[];
  isSecret: boolean;
  metadata: Record<string, unknown>;
}

/** Ending unlock conditions */
export interface EndingCondition {
  type: "choice" | "quest" | "achievement" | "relationship" | "time" | "custom";
  target: string;
  value: unknown;
  operator: "equals" | "greater" | "less" | "contains";
}

/** Ending reward */
export interface EndingReward {
  type: "unlock" | "achievement" | "cosmetic" | "meta_progression";
  value: unknown;
  description: string;
}

/** Meta-progression data */
export interface MetaProgression {
  playerId: string;
  totalPlaythroughs: number;
  endingsSeen: string[];
  secretsFound: string[];
  achievementsUnlocked: string[];
  permanentBonuses: PermanentBonus[];
  unlockedContent: string[];
  metadata: Record<string, unknown>;
  updatedAt: string;
}

/** Permanent bonus from meta-progression */
export interface PermanentBonus {
  id: string;
  name: string;
  description: string;
  type: "stat" | "ability" | "item" | "unlock";
  value: unknown;
  source: string; // which ending/achievement granted this
}

/** Playthrough creation input */
export interface CreatePlaythroughInput {
  playerId: string;
  worldId: string;
  difficulty?: PlusDifficulty;
  metadata?: Record<string, unknown>;
}

/** New game plus input */
export interface NewGamePlusInput {
  playerId: string;
  worldId: string;
  previousPlaythroughId: string;
  difficulty?: PlusDifficulty;
  carryOverChoices?: boolean;
  carryOverItems?: boolean;
}
