import { describe, expect, test, } from "bun:test";
import { DEFAULT_QUICK_EMOJIS, EMOJI_SHORTCODES, renderShortcodes, } from "./emoji";

describe("renderShortcodes", () => {
  test("replaces allowlisted codes", () => {
    expect(renderShortcodes("good morning :fire:!",),).toBe("good morning 🔥!",);
  });

  test("leaves unknown codes as literal text", () => {
    expect(renderShortcodes("a :nope: stays",),).toBe("a :nope: stays",);
  });

  test("leaves inline code spans untouched", () => {
    expect(renderShortcodes("`:fire:` vs :fire:",),).toBe("`:fire:` vs 🔥",);
  });

  test("does not touch bare colons", () => {
    expect(renderShortcodes("meet at 12:30",),).toBe("meet at 12:30",);
  });
});

describe("EMOJI_SHORTCODES", () => {
  test("every key is a name renderShortcodes can actually match", () => {
    // The renderer only matches `[a-z0-9_+-]+` inside colons; a key outside
    // that class would be dead — present in the map, unreachable in the UI.
    for (const name of Object.keys(EMOJI_SHORTCODES,)) {
      expect(name,).toMatch(/^[a-z0-9_+-]+$/,);
      expect(renderShortcodes(`:${name}:`,),).toBe(EMOJI_SHORTCODES[name]!,);
    }
  });

  test("carries no inherited prototype names", () => {
    // renderShortcodes guards with hasOwn, but the map itself must not list a
    // prototype key: `constructor` as a key would resolve to a function.
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty",]) {
      expect(Object.hasOwn(EMOJI_SHORTCODES, name,),).toBe(false,);
    }
  });

  test("aliases resolve to the same emoji as their canonical name", () => {
    // `+1`/`thumbsup` and `tree`/`evergreen_tree` are documented pairs; a
    // drift here would render two different glyphs for one concept.
    expect(EMOJI_SHORTCODES["+1"],).toBe(EMOJI_SHORTCODES.thumbsup,);
    expect(EMOJI_SHORTCODES.tree,).toBe(EMOJI_SHORTCODES.evergreen_tree,);
    expect(EMOJI_SHORTCODES.moon,).toBe(EMOJI_SHORTCODES.crescent_moon,);
  });
});

describe("DEFAULT_QUICK_EMOJIS", () => {
  test("is a non-empty, duplicate-free picker row", () => {
    expect(DEFAULT_QUICK_EMOJIS.length,).toBeGreaterThan(0,);
    expect(new Set(DEFAULT_QUICK_EMOJIS,).size,).toBe(DEFAULT_QUICK_EMOJIS.length,);
  });

  test("shows exactly the distinct emojis the shortcode map can render", () => {
    // The picker is the offline default for `GET quick-emojis`; an emoji that
    // no shortcode maps to cannot be typed by a user, and a shortcode target
    // missing from the picker means the default row drifts from the map.
    expect([...DEFAULT_QUICK_EMOJIS,].sort(),).toEqual([...new Set(Object.values(EMOJI_SHORTCODES,),),].sort(),);
  });
});
