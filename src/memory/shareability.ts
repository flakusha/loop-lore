/**
 * Memory Shareability Evaluation
 *
 * Determines whether a memory should be revealed to a viewer based on:
 * - Privacy level (public/shared/private/secret)
 * - Shareability config (probability, trusted/blocked actors)
 * - Relationship context (trust level between characters)
 *
 * Pure functions — no DB access.
 */
import { safeJsonParse, } from "../utils";
import type { MemoryPrivacy, } from "./types";

/** Parsed shareability configuration from DB JSON. */
export interface ShareabilityConfig {
  /** Base probability of sharing (0-1). */
  shareProbability: number;
  /** Character IDs that ALWAYS see this memory. */
  trustedActorIds: string[];
  /** Character IDs that NEVER see this memory. */
  blockedActorIds: string[];
}

/** Default shareability: shared memory, 50% probability, no restrictions. */
const DEFAULT_CONFIG: ShareabilityConfig = {
  shareProbability: 0.5,
  trustedActorIds: [],
  blockedActorIds: [],
};

// ─── Privacy Checks ───────────────────────────────────────────

/**
 * Check if a memory is visible to a viewer given its privacy level.
 *
 * Rules:
 * - `public`: always visible
 * - `shared`: visible to chat participants (caller must check participation separately)
 * - `private`: visible only if viewer === owner
 * - `secret`: visible only if viewer is owner or in trusted list
 *
 * @param privacy - Memory privacy level
 * @param ownerId - Who owns this memory (actor_id)
 * @param viewerId - Who is trying to see it
 * @param trustedActorIds - For secret memories: who is trusted
 * @returns True if the memory is visible
 */
export function isMemoryVisible(
  privacy: MemoryPrivacy,
  ownerId: string,
  viewerId: string,
  trustedActorIds: string[] = [],
): boolean {
  switch (privacy) {
    case "public": {
      return true;
    }
    case "shared": {
      return true;
    }
    case "private": {
      return ownerId === viewerId;
    }
    case "secret": {
      return ownerId === viewerId || trustedActorIds.includes(viewerId,);
    }
  }
}

// ─── Shareability Evaluation ──────────────────────────────────

/**
 * Parse a shareability JSON string from the database.
 *
 * @param json - Raw JSON string from shareability column
 * @returns Parsed config, or defaults if null/invalid
 */
export function parseShareability(json: string | null,): ShareabilityConfig {
  if (!json) { return DEFAULT_CONFIG; }
  const result = safeJsonParse<Partial<ShareabilityConfig>>(json,);
  if (!result.ok) { return DEFAULT_CONFIG; }
  const parsed = result.value;
  return {
    shareProbability: clampProbability(parsed.shareProbability ?? DEFAULT_CONFIG.shareProbability,),
    trustedActorIds: Array.isArray(parsed.trustedActorIds,) ? parsed.trustedActorIds : [],
    blockedActorIds: Array.isArray(parsed.blockedActorIds,) ? parsed.blockedActorIds : [],
  };
}

/**
 * Evaluate whether a memory should be shared with a viewer.
 *
 * Decision flow:
 * 1. If viewer is blocked → never share
 * 2. If viewer is trusted → always share
 * 3. Apply privacy rules
 * 4. Apply probability check
 *
 * @param params - Evaluation parameters
 * @returns Decision: "share" | "withhold"
 */
export function evaluateShareability(params: {
  privacy: MemoryPrivacy;
  ownerId: string;
  viewerId: string;
  shareability: ShareabilityConfig;
  /** Optional trust modifier (-1 to +1) based on relationship. Default: 0. */
  trustModifier?: number;
  /** Random seed for deterministic testing. If omitted, uses Math.random(). */
  randomFn?: () => number;
},): "share" | "withhold" {
  const { privacy, ownerId, viewerId, shareability, trustModifier = 0, randomFn, } = params;

  // 0. Owner always sees their own memories
  if (ownerId === viewerId) { return "share"; }

  // 1. Blocked → withhold
  if (shareability.blockedActorIds.includes(viewerId,)) {
    return "withhold";
  }

  // 2. Trusted → share
  if (shareability.trustedActorIds.includes(viewerId,)) {
    return "share";
  }

  // 3. Privacy check
  if (!isMemoryVisible(privacy, ownerId, viewerId, shareability.trustedActorIds,)) {
    return "withhold";
  }

  // 4. Probability check
  const effectiveProbability = clampProbability(shareability.shareProbability + trustModifier,);
  const roll = randomFn ? randomFn() : Math.random();
  return roll <= effectiveProbability ? "share" : "withhold";
}

// ─── Helpers ───────────────────────────────────────────────────

function clampProbability(v: number,): number {
  return Math.max(0, Math.min(1, v,),);
}
