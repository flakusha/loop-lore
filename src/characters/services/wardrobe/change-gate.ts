// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit-change gating (TASK-wardrobe-story-gm-integration-outfit-change-events).
 *
 * The immersion gate (`epic-immersion-consistency-gate.md`) does not exist
 * yet, so this module is the routing seam: player-initiated wardrobe changes
 * are REVIEWED by an {@link OutfitChangeGate}; NPC and world-rule binding
 * changes BYPASS it entirely (deterministic world state, no fiction break to
 * audit). The gate is injectable so the immersion-gate epic can plug its rule
 * engine in later without touching call sites.
 */

/** Fixed set of actors that can initiate an outfit change. */
export const OutfitChangeInitiator = {
  /** The player's own actor (routes through the gate). */
  Player: "player",
  /** GM/story-driven change (routes through the gate). */
  Gm: "gm",
  /** NPC outfit change from world simulation (bypasses the gate). */
  Npc: "npc",
  /** Location/world-rule binding (bypasses the gate). */
  WorldRule: "world_rule",
} as const;
/** One of {@link OutfitChangeInitiator}. */
export type OutfitChangeInitiator = (typeof OutfitChangeInitiator)[keyof typeof OutfitChangeInitiator];

/** One outfit-change request under review. */
export interface OutfitChangeRequest {
  actorId: string;
  /** Chat scope when the change is scene-local (chat/scene override). */
  chatId?: string;
  /** Outfit being left (null = base/no outfit). */
  fromOutfitId?: string | null;
  /** Outfit being entered (null = clear to base). */
  toOutfitId?: string | null;
  initiator: OutfitChangeInitiator;
}

/** Gate verdict for one outfit change. */
export interface OutfitChangeVerdict {
  allowed: boolean;
  /** Human-readable refusal reason when `allowed` is false. */
  reason?: string;
  /** True when the initiator class bypasses the gate (npc/world_rule). */
  bypassed?: boolean;
}

/** Reviews a player/GM-initiated outfit change for fiction consistency. */
export interface OutfitChangeGate {
  review(request: OutfitChangeRequest,): OutfitChangeVerdict | Promise<OutfitChangeVerdict>;
}

/** Default gate: allow everything until `epic-immersion-consistency-gate` lands. */
export const allowAllOutfitChangeGate: OutfitChangeGate = {
  review: () => ({ allowed: true, }),
};

/**
 * Route one outfit change through (or around) the immersion gate.
 *
 * `npc` and `world_rule` initiators bypass unconditionally — the gate only
 * audits player/GM fiction-driven changes.
 *
 * @param request - The change under review.
 * @param gate - Gate to consult for player/GM initiators; defaults to allow-all.
 * @returns The verdict, including `bypassed: true` for npc/world_rule.
 * @throws {Error} When the gate itself throws (caller decides fallback).
 */
export async function requestOutfitChange(
  request: OutfitChangeRequest,
  gate: OutfitChangeGate = allowAllOutfitChangeGate,
): Promise<OutfitChangeVerdict> {
  if (request.initiator === OutfitChangeInitiator.Npc || request.initiator === OutfitChangeInitiator.WorldRule) {
    return { allowed: true, bypassed: true, };
  }
  return await gate.review(request,);
}
