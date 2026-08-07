/**
 * Single-memory injection decision.
 */
import type { MemoryEntry, } from "../types";
import { checkInjectionPrivacy, } from "./privacy";
import { isContextRelevant, } from "./relevance";
import {
  DEFAULT_COMFORT,
  type InjectionContext,
  type InjectionPrivacyLevel,
  type MemoryComfort,
  type MemoryInjectionConfig,
} from "./types";

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
