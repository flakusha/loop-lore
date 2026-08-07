// src/config/schema-class/hooks.ts — hooks section defaults
import type { HooksConfig, } from "../schema";

export const HOOKS_DEFAULTS = {
  enableMoodHooks: true,
  enableEmotionHooks: true,
  enableNsfwHooks: true,
  enableModerationHooks: true,
} satisfies HooksConfig;
