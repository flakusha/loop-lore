// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { isRatingAllowed, NSFWContentRating, } from "../../schemas/nsfw-rating";
import {
  NSFWContentRating as Reexported,
  type NsfwModerationAction,
  type NsfwModerationActionType,
} from "./nsfw";

describe("nsfw types rating wiring (B4)", () => {
  it("NsfwModerationAction accepts a rating tier", () => {
    const action: NsfwModerationAction = {
      type: "nsfw_block" satisfies NsfwModerationActionType,
      targetActorId: "a1",
      scope: "chat",
      actorId: "admin",
      internal: true,
      rating: NSFWContentRating.NSFW_EXTREME,
      timestamp: new Date(),
    };
    expect(action.rating,).toBe(NSFWContentRating.NSFW_EXTREME,);
  });

  it("rating field is optional", () => {
    const action: NsfwModerationAction = {
      type: "nsfw_block",
      targetActorId: "a1",
      scope: "chat",
      actorId: "admin",
      internal: true,
      timestamp: new Date(),
    };
    expect(action.rating,).toBeUndefined();
  });

  it("re-exports NSFWContentRating from chat types", () => {
    expect(Reexported,).toBe(NSFWContentRating,);
  });

  it("rating can drive enforcement via isRatingAllowed", () => {
    expect(isRatingAllowed(NSFWContentRating.NSFW_MILD, NSFWContentRating.NSFW_MODERATE,),).toBe(true,);
  });
});
