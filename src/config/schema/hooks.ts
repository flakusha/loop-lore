// src/config/schema/hooks.ts — Hooks (fast review & trigger system) config type

export interface HooksConfig {
  /** Enable mood shift detection hooks. Default true. */
  enableMoodHooks: boolean;
  /** Enable emotion change detection hooks. Default true. */
  enableEmotionHooks: boolean;
  /** Enable NSFW content gating hooks. Default true. */
  enableNsfwHooks: boolean;
  /** Enable moderation flagging hooks. Default true. */
  enableModerationHooks: boolean;
}
