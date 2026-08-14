/** Chat modes from the DB enum */
export type ChatMode = "direct" | "group" | "story";

/** Feature flags per chat mode */
export interface ModeFeatureFlags {
  /** Context window management (sliding window, pruning) */
  contextWindow: boolean;
  /** Chat transitions (scene changes, context cuts) */
  transitions: boolean;
  /** Memory injection from characters/world */
  memoryInjection: boolean;
  /** Turn-based orchestration */
  turnOrchestration: boolean;
  /** Visual novel mode */
  visualNovel: boolean;
  /** Response length control */
  responseLength: boolean;
  /** Chat autonaming */
  autoRename: boolean;
  /** Quick-regen */
  quickRegen: boolean;
}

/** Default feature flags per chat mode */
export const MODE_DEFAULTS: Record<ChatMode, ModeFeatureFlags> = {
  direct: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: false,
    visualNovel: true,
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
  group: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: true,
    visualNovel: false, // group chat has multiple speakers
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
  story: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: true,
    visualNovel: true,
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
} as const;

/** Resolve feature flags for a chat, merging mode defaults with per-chat overrides */
export function resolveFeatureFlags(
  mode: ChatMode,
  overrides?: Partial<ModeFeatureFlags>,
): ModeFeatureFlags {
  const defaults = MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.direct;
  return { ...defaults, ...overrides, };
}

/**
 * Chat-level GM configuration. Stored as JSON in `chats.gm_config`.
 *
 * This is the lightweight chat settings config — not the full story-mode
 * `GameMasterConfig` from `src/story/types.ts`. Story mode uses the richer
 * `GameMasterConfig` with LLM settings, human GM, escalation thresholds.
 */
/** Narrative guidance a human Game Master applies to a story chat. */
export interface GmGuidance {
  /** Free-form narrative constraints for the next turn (in-character, topic, tone). */
  constraints: string[];
  /** Character the GM wants to respond next. */
  targetCharacter?: string;
  /** Scene description broadcast to all participants. */
  sceneDescription?: string;
  /** Per-participant turn priority for the next round. */
  turnPriority: Record<string, "high" | "medium" | "low">;
}

export interface GmConfig {
  /** Assistant's role in this chat: off, helper, gm, or moderator */
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  /** Visual novel mode (image-heavy, sequential panel display) */
  visualNovel?: boolean;
  /** Story-mode flag enabling the human-GM guided-story UX. */
  storyMode?: boolean;
  /** Active human-GM narrative guidance (persisted, mutable at runtime). */
  gmGuidance?: GmGuidance;
}
