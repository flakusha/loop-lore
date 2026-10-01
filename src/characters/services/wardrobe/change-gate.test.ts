// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the outfit-change gate routing seam
 * (TASK-wardrobe-story-gm-integration-outfit-change-events):
 * player/GM changes are reviewed; NPC/world-rule changes bypass.
 */
import { describe, expect, it, } from "bun:test";
import {
  OutfitChangeInitiator,
  allowAllOutfitChangeGate,
  requestOutfitChange,
  type OutfitChangeGate,
  type OutfitChangeRequest,
} from "./change-gate";

const BASE: OutfitChangeRequest = {
  actorId: "actor-1",
  chatId: "chat-1",
  fromOutfitId: null,
  toOutfitId: "outfit-1",
  initiator: OutfitChangeInitiator.Player,
};

describe("requestOutfitChange routing", () => {
  it("routes player changes through the gate and honors a refusal", async () => {
    const seen: { current: OutfitChangeRequest | null } = { current: null, };
    const refusing: OutfitChangeGate = {
      review: (request,) => {
        seen.current = request;
        return { allowed: false, reason: "wardrobe breaks the scene", };
      },
    };
    const verdict = await requestOutfitChange(BASE, refusing,);
    expect(seen.current?.actorId,).toBe("actor-1",);
    expect(seen.current?.toOutfitId,).toBe("outfit-1",);
    expect(verdict.allowed,).toBe(false,);
    expect(verdict.reason,).toBe("wardrobe breaks the scene",);
    expect(verdict.bypassed,).toBeUndefined();
  });

  it("routes GM changes through the gate (allowed path)", async () => {
    const verdict = await requestOutfitChange(
      { ...BASE, initiator: OutfitChangeInitiator.Gm, },
      allowAllOutfitChangeGate,
    );
    expect(verdict.allowed,).toBe(true,);
    expect(verdict.bypassed,).toBeFalsy();
  });

  it("bypasses the gate for NPC initiators even when it would refuse", async () => {
    const refusing: OutfitChangeGate = { review: () => ({ allowed: false, }), };
    const verdict = await requestOutfitChange(
      { ...BASE, initiator: OutfitChangeInitiator.Npc, },
      refusing,
    );
    expect(verdict.allowed,).toBe(true,);
    expect(verdict.bypassed,).toBe(true,);
  });

  it("bypasses the gate for world-rule initiators (location bindings)", async () => {
    const refusing: OutfitChangeGate = { review: () => ({ allowed: false, }), };
    const verdict = await requestOutfitChange(
      { ...BASE, initiator: OutfitChangeInitiator.WorldRule, },
      refusing,
    );
    expect(verdict.allowed,).toBe(true,);
    expect(verdict.bypassed,).toBe(true,);
  });

  it("defaults to the allow-all gate when none is supplied", async () => {
    const verdict = await requestOutfitChange(BASE,);
    expect(verdict.allowed,).toBe(true,);
  });
});
