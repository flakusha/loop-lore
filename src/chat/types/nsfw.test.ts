import { describe, expect, it, } from "bun:test";
import { isRatingAllowed, NSFWContentRating, } from "../../schemas/nsfw-rating";
import {
  NSFWContentRating as Reexported,
  type NsfwModerationAction,
} from "./nsfw";

describe("nsfw types rating wiring (B4)", () => {
  it("NsfwModerationAction accepts a rating tier", () => {
    const action: NsfwModerationAction = {
      type: "nsfw_block",
      targetActorId: "a1",
      scope: "chat",
      actorId: "admin",
      internal: true,
      rating: NSFWContentRating.NSFW_EXTREME,
    };
    expect(action.rating,).toBe(NSFWContentRating.NSFW_EXTREME,);
  });

  it("rating field is optional", () => {
    const action: NsfwModerationAction = {
      type: "nsfw_flag",
      targetActorId: "a1",
      scope: "chat",
      actorId: "admin",
      internal: false,
    };
    expect(action.rating,).toBeUndefined();
  });

  it("re-exports NSFWContentRating from chat types", () => {
    expect(Reexported,).toBe(NSFWContentRating,);
  });

  it("rating can drive enforcement via isRatingAllowed", () => {
    expect(isRatingAllowed(NSFWContentRating.NSFW_EXTREME, NSFWContentRating.NSFW_MODERATE,),).toBe(false,);
    expect(isRatingAllowed(NSFWContentRating.NSFW_MILD, NSFWContentRating.NSFW_MODERATE,),).toBe(true,);
  });
});
