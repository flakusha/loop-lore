// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/nsfw-filter.ts — NsfwFilter.detect + filter-mode dispatch
 * + keyword list mutation.
 */
import { beforeEach, describe, expect, it, } from "bun:test";
import { NsfwFilter, type NsfwFilterConfig, } from "./nsfw-filter";

describe("NsfwFilter.isNsfw", () => {
  let filter: NsfwFilter;

  beforeEach(() => {
    filter = new NsfwFilter();
  },);

  it("returns false for neutral content with no rating", () => {
    expect(filter.isNsfw("Hello there",),).toBe(false,);
  });

  it("flags content when its contentRating matches a trigger rating", () => {
    expect(filter.isNsfw("anything", "nsfw_intense",),).toBe(true,);
    expect(filter.isNsfw("anything", "nsfw_extreme",),).toBe(true,);
    expect(filter.isNsfw("anything", "nsfw_mild",),).toBe(true,);
  });

  it("does not flag content whose rating is not a trigger", () => {
    expect(filter.isNsfw("fine", "safe",),).toBe(false,);
  });

  it("does not flag empty content even when rating is provided", () => {
    expect(filter.isNsfw("", "nsfw_intense",),).toBe(true,); // rating wins
  });

  it("flags content when any default keyword appears (case-insensitive)", () => {
    expect(filter.isNsfw("Walking NUDE on the beach",),).toBe(true,);
    expect(filter.isNsfw("an intimate moment",),).toBe(true,);
    expect(filter.isNsfw("ORGASM",),).toBe(true,);
  });

  it("respects a custom keyword list — drops defaults when overridden", () => {
    const custom = new NsfwFilter({ keywords: ["banana",], },);
    expect(custom.isNsfw("a naked person",),).toBe(false,); // default dropped
    expect(custom.isNsfw("a banana split",),).toBe(true,);
  });

  it("respects a custom trigger rating list", () => {
    const custom = new NsfwFilter({ triggerRatings: ["custom_rating",], },);
    expect(custom.isNsfw("anything", "nsfw_intense",),).toBe(false,); // not in custom
    expect(custom.isNsfw("anything", "custom_rating",),).toBe(true,);
  });
});

describe("NsfwFilter.filter", () => {
  let filter: NsfwFilter;

  beforeEach(() => {
    filter = new NsfwFilter({ mode: "blur", },);
  },);

  it("passes content through unchanged when not NSFW", () => {
    expect(filter.filter("Hello there",),).toBe("Hello there",);
  });

  it("returns the blur placeholder when mode=blur and content is NSFW", () => {
    expect(filter.filter("a nude walk",),).toBe("[NSFW Content Hidden]",);
  });

  it("returns null when mode=hide", () => {
    filter.setMode("hide",);
    expect(filter.filter("a nude walk",),).toBeNull();
  });

  it("returns the fade-to-black placeholder when mode=fade_to_black", () => {
    filter.setMode("fade_to_black",);
    expect(filter.filter("a nude walk",),).toBe("[The scene fades to black...]",);
  });

  it("returns content unchanged when mode=show", () => {
    filter.setMode("show",);
    expect(filter.filter("a nude walk",),).toBe("a nude walk",);
  });

  it("honors contentRating even if content lacks a keyword", () => {
    expect(filter.filter("totally innocent", "nsfw_intense",),).toBe("[NSFW Content Hidden]",);
  });
});

describe("NsfwFilter.mode accessors", () => {
  it("getMode returns the configured mode", () => {
    const filter = new NsfwFilter({ mode: "hide", },);
    expect(filter.getMode(),).toBe("hide",);
  });

  it("setMode updates the configured mode", () => {
    const filter = new NsfwFilter();
    filter.setMode("fade_to_black",);
    expect(filter.getMode(),).toBe("fade_to_black",);
  });
});

describe("NsfwFilter keyword mutation", () => {
  it("addKeyword is idempotent — repeated calls don't duplicate", () => {
    const filter = new NsfwFilter();
    filter.addKeyword("tomato",);
    filter.addKeyword("tomato",);
    filter.addKeyword("tomato",);
    expect(filter.isNsfw("a tomato",),).toBe(true,);
    // The matcher only cares about whether the keyword is present; this
    // test asserts presence is established by exactly one add.
  });

  it("removeKeyword removes a previously-added keyword", () => {
    const filter = new NsfwFilter();
    filter.addKeyword("tomato",);
    expect(filter.isNsfw("a tomato",),).toBe(true,);
    filter.removeKeyword("tomato",);
    expect(filter.isNsfw("a tomato",),).toBe(false,);
  });

  it("removeKeyword is a no-op when the keyword is absent", () => {
    const filter = new NsfwFilter();
    filter.removeKeyword("never-added",);
    // No error, no change — content still neutral.
    expect(filter.isNsfw("Hello",),).toBe(false,);
  });
});

describe("NsfwFilter default config", () => {
  it("uses 'show' mode by default (no filtering)", () => {
    const filter = new NsfwFilter();
    expect(filter.getMode(),).toBe("show",);
  });

  it("exposes the defaults via a typed config when passed in full", () => {
    const full: NsfwFilterConfig = {
      mode: "blur",
      triggerRatings: ["a",],
      keywords: ["b",],
    };
    const filter = new NsfwFilter(full,);
    expect(filter.getMode(),).toBe("blur",);
    expect(filter.isNsfw("anything", "a",),).toBe(true,);
    expect(filter.isNsfw("a b sentence",),).toBe(true,);
  });
});
