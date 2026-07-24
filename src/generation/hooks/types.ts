/**
 * Hook Types — Fast Review & Trigger System
 *
 * Hooks use the main/aux LLM to analyze content and trigger events
 * (mood shifts, emotion changes, NSFW gating, moderation flags).
 * All hooks respect privacy settings and NSFW allowance.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { NsfwConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export type HookEventType =
  | "mood_shift"
  | "emotion_change"
  | "nsfw_gate"
  | "moderation_flag"
  | "privacy_check";

export interface HookContext {
  chatId: string;
  actorId: string;
  userId: string;
  content: string;
  nsfwPolicy?: string;
  privacyLevel?: string;
  /** Targeted event types — hooks not in this list are skipped. Omit to run all. */
  eventTypes?: HookEventType[];
  config: Config;
  nsfwConfig: NsfwConfig;
  db: Kysely<DB>;
}

export interface HookResult {
  handled: boolean;
  eventType: HookEventType;
  data?: Record<string, unknown>;
  suppressContent?: boolean;
  reason?: string;
}

export interface HookHandler {
  readonly name: string;
  readonly eventTypes: HookEventType[];
  canHandle(content: string, context: HookContext,): Promise<boolean>;
  execute(content: string, context: HookContext,): Promise<HookResult>;
}

export interface HookChainOptions {
  hooks: HookHandler[];
  context: HookContext;
}

export interface HookChainResult {
  allowed: boolean;
  results: HookResult[];
  suppressedContent: boolean;
  events: HookResult[];
}
