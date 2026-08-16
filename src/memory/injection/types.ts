// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory injection types — extended privacy, config, comfort, context.
 */

/**
 * Extended privacy levels for memory injection.
 * Maps to the base MemoryPrivacy for backward compatibility.
 */
export type InjectionPrivacyLevel =
  | "absolute"
  | "isolated"
  | "localized"
  | "contextual"
  | "shared"
  | "public"
  | "private"
  | "secret";

/** Per-memory injection configuration. */
export interface MemoryInjectionConfig {
  /** Base probability of injection (0-1). */
  baseProbability: number;
  /** Randomness/variance in injection chance (0-1). */
  randomness: number;
  /** Multiplier when context is relevant to the memory. */
  contextBoost: number;
  /** Max memories injected per message. */
  maxPerMessage: number;
  /** Minimum turns between injections of the same memory. */
  cooldownTurns: number;
}

/** Default injection config. */
export const DEFAULT_INJECTION_CONFIG: MemoryInjectionConfig = {
  baseProbability: 0.6,
  randomness: 0.2,
  contextBoost: 1.5,
  maxPerMessage: 5,
  cooldownTurns: 3,
};

/** Character comfort settings affecting memory sharing. */
export interface MemoryComfort {
  /** General willingness to share memories (0-1). */
  sharingWillingness: number;
  /** Probability of sharing secret memories (0-1). */
  secretSharingProbability: number;
  /** Mood modifier — happiness boosts sharing, sadness reduces it (-1 to +1). */
  moodModifier: number;
  /** Minimum intimacy level required for secret sharing (0-100). */
  intimacyThreshold: number;
  /** Resistance to sharing traumatic memories (0-1). */
  traumaResistance: number;
}

/** Default comfort settings. */
export const DEFAULT_COMFORT: MemoryComfort = {
  sharingWillingness: 0.7,
  secretSharingProbability: 0.3,
  moodModifier: 0,
  intimacyThreshold: 50,
  traumaResistance: 0.5,
};

/** Record of a memory injection attempt. */
export interface MemoryInjectionEvent {
  memoryId: string;
  actorId: string;
  injectedAt: Date;
  context: string;
  probability: number;
  injected: boolean;
  reason?: string;
}

/** Context for injection decisions. */
export interface InjectionContext {
  /** Current chat ID. */
  chatId: string;
  /** Current world ID. */
  worldId: string | null;
  /** Location ID (for localized privacy). */
  locationId: string | null;
  /** Whether this is a one-on-one chat. */
  isPrivateChat: boolean;
  /** Number of participants. */
  participantCount: number;
  /** Current turn number (for cooldown tracking). */
  turnNumber: number;
  /** Keywords from the current message (for relevance matching). */
  currentKeywords: string[];
  /** Average intimacy with memory owner (0-100). */
  averageIntimacy: number;
  /** Owner's current mood modifier (-1 to +1). */
  moodModifier: number;
  /** Random function for deterministic testing. */
  randomFn?: () => number;
}
