/**
 * Memory Injection — Probability-Based, Privacy-Aware Injection
 *
 * Controls which memories get injected into chat context with
 * configurable probability, privacy levels, and character comfort.
 *
 * Builds on the existing provision pipeline (scope/privacy/shareability)
 * by adding per-memory injection probability and comfort modifiers.
 *
 * Privacy levels (extended from base):
 * - absolute: never shared, only the owning character knows
 * - isolated: only in private one-on-one chats with owner
 * - localized: shared within specific world/context
 * - contextual: shared based on relationship/context (uses shareability)
 * - shared: visible to chat participants (default)
 * - public: can be shared freely
 * - private: visible only to owner
 * - secret: visible to owner + trusted actors via probability
 */
import type { MemoryEntry, MemoryPrivacy, } from "./types";

// ── Extended Privacy Levels ─────────────────────────────────

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

/** Map extended privacy to base privacy for provision pipeline. */
export function toBasePrivacy(level: InjectionPrivacyLevel,): MemoryPrivacy {
  switch (level) {
    case "absolute":
    case "isolated":
    case "private": {
      return "private";
    }
    case "localized":
    case "contextual":
    case "shared": {
      return "shared";
    }
    case "public": {
      return "public";
    }
    case "secret": {
      return "secret";
    }
  }
}

// ── Injection Configuration ─────────────────────────────────

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

// ── Comfort System ──────────────────────────────────────────

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

// ── Injection Event ─────────────────────────────────────────

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

// ── Injection Algorithm ─────────────────────────────────────

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

/**
 * Determine whether a memory should be injected into the current context.
 *
 * Applies in order:
 * 1. Privacy level check
 * 2. Injection probability (base + randomness + context boost)
 * 3. Comfort modifiers (willingness, mood, intimacy, trauma)
 * 4. Cooldown check
 * 5. Final random roll
 *
 * @param memory - The memory to evaluate
 * @param config - Injection configuration
 * @param ctx - Current injection context
 * @param comfort - Character comfort settings
 * @param lastInjectedTurn - Last turn this memory was injected (-1 if never)
 * @returns Injection decision with probability and reason
 */
export function shouldInjectMemory(
  memory: MemoryEntry,
  config: MemoryInjectionConfig,
  ctx: InjectionContext,
  comfort: MemoryComfort = DEFAULT_COMFORT,
  lastInjectedTurn = -1,
): { inject: boolean; probability: number; reason: string } {
  const privacy = (memory.privacy ?? "shared") as InjectionPrivacyLevel;

  // 1. Privacy gate — hard block
  const privacyBlock = checkInjectionPrivacy(privacy, ctx,);
  if (privacyBlock) {
    return { inject: false, probability: 0, reason: privacyBlock, };
  }

  // 2. Cooldown check
  if (lastInjectedTurn >= 0 && (ctx.turnNumber - lastInjectedTurn) < config.cooldownTurns) {
    return {
      inject: false,
      probability: 0,
      reason: `cooldown: ${config.cooldownTurns - (ctx.turnNumber - lastInjectedTurn)} turns remaining`,
    };
  }

  // 3. Base probability
  let probability = config.baseProbability;

  // 4. Randomness modifier
  const roll = ctx.randomFn ? ctx.randomFn() : Math.random();
  probability += (roll - 0.5) * config.randomness;

  // 5. Context relevance boost
  if (isContextRelevant(memory, ctx,)) {
    probability *= config.contextBoost;
  }

  // 6. Comfort modifiers
  probability *= comfort.sharingWillingness;
  probability *= 1 + comfort.moodModifier;

  // 7. Intimacy gate for secret memories
  if (privacy === "secret") {
    if (ctx.averageIntimacy < comfort.intimacyThreshold) {
      return {
        inject: false,
        probability: 0,
        reason: `intimacy:${ctx.averageIntimacy} < threshold:${comfort.intimacyThreshold}`,
      };
    }
    probability *= comfort.secretSharingProbability;
  }

  // 8. Trauma resistance for high-importance memories
  if (memory.importance > 0.8) {
    probability *= 1 - comfort.traumaResistance * 0.5;
  }

  // 9. Clamp and final roll
  probability = Math.max(0, Math.min(1, probability,),);
  const finalRoll = ctx.randomFn ? ctx.randomFn() : Math.random();
  const inject = finalRoll <= probability;

  return {
    inject,
    probability,
    reason: inject
      ? `passed: ${finalRoll.toFixed(3,)} <= ${probability.toFixed(3,)}`
      : `failed: ${finalRoll.toFixed(3,)} > ${probability.toFixed(3,)}`,
  };
}

// ── Privacy Check ───────────────────────────────────────────

/**
 * Check injection privacy — hard blocks based on level and context.
 * Returns rejection reason, or null if allowed.
 */
function checkInjectionPrivacy(
  level: InjectionPrivacyLevel,
  ctx: InjectionContext,
): string | null {
  switch (level) {
    case "absolute": {
      return "privacy:absolute_never_shared";
    }
    case "isolated": {
      if (!ctx.isPrivateChat) { return "privacy:isolated_requires_private_chat"; }
      return null;
    }
    case "localized": {
      if (!ctx.worldId) { return "privacy:localized_requires_world"; }
      return null;
    }
    case "contextual":
    case "shared":
    case "public":
    case "private":
    case "secret": {
      return null; // handled by provision pipeline
    }
  }
}

// ── Relevance Check ─────────────────────────────────────────

/**
 * Check if a memory is contextually relevant to the current conversation.
 * Uses keyword overlap as a simple relevance signal.
 */
function isContextRelevant(
  memory: MemoryEntry,
  ctx: InjectionContext,
): boolean {
  if (ctx.currentKeywords.length === 0 || memory.keywords.length === 0) {
    return false;
  }

  const memoryKeywords = new Set(Array.from(memory.keywords, (k,) => k.toLowerCase(),),);
  let overlap = 0;

  for (const keyword of ctx.currentKeywords) {
    if (memoryKeywords.has(keyword.toLowerCase(),)) {
      overlap++;
    }
  }

  // Relevant if at least 2 keywords overlap, or 20% of memory keywords match
  return overlap >= 2 || (memory.keywords.length > 0 && overlap / memory.keywords.length >= 0.2);
}

// ── Batch Injection ─────────────────────────────────────────

/**
 * Evaluate a batch of memories for injection, respecting maxPerMessage.
 *
 * @param memories - Candidate memories (should already be provision-filtered)
 * @param config - Injection configuration
 * @param ctx - Current injection context
 * @param comfort - Character comfort settings
 * @param injectionHistory - Map of memoryId → last turn injected
 * @returns Memories to inject, sorted by importance descending
 */
export function selectMemoriesForInjection(
  memories: MemoryEntry[],
  config: MemoryInjectionConfig,
  ctx: InjectionContext,
  comfort: MemoryComfort = DEFAULT_COMFORT,
  injectionHistory = new Map<string, number>(),
): { selected: MemoryEntry[]; rejected: { memory: MemoryEntry; reason: string; probability: number }[] } {
  const selected: MemoryEntry[] = [];
  const rejected: { memory: MemoryEntry; reason: string; probability: number }[] = [];

  // Sort by importance descending — most important first
  const sorted = [...memories,].sort((a, b,) => b.importance - a.importance);

  for (const memory of sorted) {
    if (selected.length >= config.maxPerMessage) {
      rejected.push({
        memory,
        reason: `max_per_message:${config.maxPerMessage}`,
        probability: 0,
      },);
      continue;
    }

    const lastTurn = injectionHistory.get(memory.id,) ?? -1;
    const decision = shouldInjectMemory(memory, config, ctx, comfort, lastTurn,);

    if (decision.inject) {
      selected.push(memory,);
    } else {
      rejected.push({
        memory,
        reason: decision.reason,
        probability: decision.probability,
      },);
    }
  }

  return { selected, rejected, };
}
