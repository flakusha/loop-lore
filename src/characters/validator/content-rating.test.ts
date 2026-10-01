// src/characters/validator/content-rating.test.ts
//
// Edge-case tests for content-rating validators + age helpers.
// Trust boundary: invalid rating values, age boundaries (12/13/17/18),
// null-age handling, and rating-filter semantics.

import { describe, expect, it, } from "bun:test";

import { ContentRating, } from "../spec";
import type {
  CanonicalCharacter,
  ValidationError,
} from "../spec";
import {
  filterAllowedRatings,
  getMinimumAge,
  isContentRatingAllowed,
  validateContentRating,
} from "./content-rating";

const baseCharacter: CanonicalCharacter = {
  name: "Test",
  description: "Test desc",
  personality: "Test personality",
  appearance: "Test appearance",
  default_outfit: "travel-gear",
  outfits: [
    { id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy traveling clothes", },
  ],
};

function charWith(overrides: Record<string, unknown>,): CanonicalCharacter {
  return { ...baseCharacter, ...overrides, } as unknown as CanonicalCharacter;
}

function freshErrors(): ValidationError[] {
  return [];
}

describe("validateContentRating", () => {
  it("accepts each valid content rating", () => {
    for (
      const rating of [
        ContentRating.Sfw,
        ContentRating.NsfwMild,
        ContentRating.NsfwModerate,
        ContentRating.NsfwIntense,
        ContentRating.NsfwExtreme,
      ]
    ) {
      const errors = freshErrors();
      validateContentRating(charWith({ content_rating: rating, },), errors, [],);
      expect(errors,).toHaveLength(0,);
    }
  });

  it("accepts undefined content_rating", () => {
    const errors = freshErrors();
    validateContentRating(baseCharacter, errors, [],);
    expect(errors,).toHaveLength(0,);
  });

  it("accepts null content_rating", () => {
    const errors = freshErrors();
    validateContentRating(charWith({ content_rating: null, },), errors, [],);
    expect(errors,).toHaveLength(0,);
  });

  it("flags an unknown rating string as INVALID_VALUE", () => {
    const errors = freshErrors();
    validateContentRating(charWith({ content_rating: "bogus", },), errors, [],);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("content_rating",);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
    expect(errors[0]?.value,).toBe("bogus",);
  });

  it("flags a non-string rating as INVALID_VALUE", () => {
    const errors = freshErrors();
    validateContentRating(charWith({ content_rating: 42, },), errors, [],);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
    expect(errors[0]?.value,).toBe(42,);
  });

  it("accepts an empty-string rating (falsy short-circuit)", () => {
    const errors = freshErrors();
    validateContentRating(charWith({ content_rating: "", },), errors, [],);
    expect(errors,).toHaveLength(0,);
  });

  it("lists the valid ratings in the error message", () => {
    const errors = freshErrors();
    validateContentRating(charWith({ content_rating: "bogus", },), errors, [],);
    expect(errors[0]?.message,).toContain("sfw",);
    expect(errors[0]?.message,).toContain("nsfw_mild",);
    expect(errors[0]?.message,).toContain("nsfw_extreme",);
  });
});

describe("isContentRatingAllowed", () => {
  it("allows sfw for any age including null", () => {
    expect(isContentRatingAllowed(ContentRating.Sfw, null,),).toBe(true,);
    expect(isContentRatingAllowed(ContentRating.Sfw, 0,),).toBe(true,);
    expect(isContentRatingAllowed(ContentRating.Sfw, 100,),).toBe(true,);
  });

  it("blocks nsfw_mild below age 13", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwMild, 0,),).toBe(false,);
    expect(isContentRatingAllowed(ContentRating.NsfwMild, 12,),).toBe(false,);
  });

  it("allows nsfw_mild at age 13 (boundary)", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwMild, 13,),).toBe(true,);
  });

  it("blocks all nsfw ratings when age is null", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwMild, null,),).toBe(false,);
    expect(isContentRatingAllowed(ContentRating.NsfwModerate, null,),).toBe(false,);
    expect(isContentRatingAllowed(ContentRating.NsfwIntense, null,),).toBe(false,);
    expect(isContentRatingAllowed(ContentRating.NsfwExtreme, null,),).toBe(false,);
  });

  it("blocks nsfw_moderate below 18", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwModerate, 13,),).toBe(false,);
    expect(isContentRatingAllowed(ContentRating.NsfwModerate, 17,),).toBe(false,);
  });

  it("allows nsfw_moderate at 18 (boundary)", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwModerate, 18,),).toBe(true,);
  });

  it("allows nsfw_intense and nsfw_extreme at 18", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwIntense, 18,),).toBe(true,);
    expect(isContentRatingAllowed(ContentRating.NsfwExtreme, 18,),).toBe(true,);
  });

  it("allows nsfw ratings for ages well above the threshold", () => {
    expect(isContentRatingAllowed(ContentRating.NsfwExtreme, 99,),).toBe(true,);
  });
});

describe("getMinimumAge", () => {
  it("returns null for sfw", () => {
    expect(getMinimumAge(ContentRating.Sfw,),).toBeNull();
  });

  it("returns 13 for nsfw_mild", () => {
    expect(getMinimumAge(ContentRating.NsfwMild,),).toBe(13,);
  });

  it("returns 18 for nsfw_moderate, nsfw_intense, and nsfw_extreme", () => {
    expect(getMinimumAge(ContentRating.NsfwModerate,),).toBe(18,);
    expect(getMinimumAge(ContentRating.NsfwIntense,),).toBe(18,);
    expect(getMinimumAge(ContentRating.NsfwExtreme,),).toBe(18,);
  });
});

describe("filterAllowedRatings", () => {
  const all = [
    ContentRating.Sfw,
    ContentRating.NsfwMild,
    ContentRating.NsfwModerate,
    ContentRating.NsfwIntense,
    ContentRating.NsfwExtreme,
  ];

  it("returns only sfw when age is null", () => {
    expect(filterAllowedRatings(all, null,),).toEqual([ContentRating.Sfw,],);
  });

  it("returns only sfw below age 13", () => {
    expect(filterAllowedRatings(all, 12,),).toEqual([ContentRating.Sfw,],);
  });

  it("returns sfw and nsfw_mild at age 13", () => {
    expect(filterAllowedRatings(all, 13,),).toEqual(
      [ContentRating.Sfw, ContentRating.NsfwMild,],
    );
  });

  it("returns sfw and nsfw_mild at age 17", () => {
    expect(filterAllowedRatings(all, 17,),).toEqual(
      [ContentRating.Sfw, ContentRating.NsfwMild,],
    );
  });

  it("returns all ratings at age 18", () => {
    expect(filterAllowedRatings(all, 18,),).toEqual(all,);
  });

  it("returns an empty array for empty input at a concrete age", () => {
    expect(filterAllowedRatings([], 18,),).toEqual([],);
  });

  it("returns only sfw for empty input when age is null", () => {
    expect(filterAllowedRatings([], null,),).toEqual([ContentRating.Sfw,],);
  });

  it("preserves input order", () => {
    const reversed = [...all,].reverse();
    expect(filterAllowedRatings(reversed, 18,),).toEqual(reversed,);
  });

  it("does not mutate the input array", () => {
    const input = [...all,];
    filterAllowedRatings(input, 13,);
    expect(input,).toEqual(all,);
  });

  it("filters a subset input", () => {
    expect(
      filterAllowedRatings([ContentRating.NsfwModerate, ContentRating.Sfw,], 18,),
    ).toEqual([ContentRating.NsfwModerate, ContentRating.Sfw,],);
  });
});
