import type { EmotionEntry, MergeStrategy, } from "../sections/templates";

// ── Types ──────────────────────────────────────────────────

/** Expansion configuration for a single domain */
export interface ExpansionConfig {
  /** Merge strategy for this expansion */
  merge: MergeStrategy;
  /** Additional keywords to add */
  keywords?: string[];
  /** Additional actions to add */
  actions?: string[];
  /** Additional emotions to add */
  emotions?: Record<string, EmotionEntry>;
  /** Additional intent patterns to add */
  intentPatterns?: { pattern: string; emotion: string }[];
  /** Whether to auto-generate missing emotion avatars via SD */
  generateMissingAvatars?: boolean;
}

/** Result of template expansion */
export interface ExpansionResult {
  /** Keywords added */
  keywordsAdded: string[];
  /** Actions added */
  actionsAdded: string[];
  /** Emotions added */
  emotionsAdded: string[];
  /** Intent patterns added */
  patternsAdded: number;
  /** Avatars generated */
  avatarsGenerated: number;
  /** Errors encountered */
  errors: string[];
}
