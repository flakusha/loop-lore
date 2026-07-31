import { describe, expect, it, } from "bun:test";
import {
  ACTION_MARKER,
  DIALOGUE_QUOTES,
  FIRST_PERSON,
  PAST_VERBS,
  PRESENT_VERBS,
  PROPER_NOUN,
  PROPER_NOUN_ENTITY,
  SENTENCE_END,
} from "./narrative";

describe("narrative regex", () => {
  describe("DIALOGUE_QUOTES", () => {
    it("matches straight quotes", () => {
      expect(DIALOGUE_QUOTES.test('"Hello"',),).toBe(true,);
      DIALOGUE_QUOTES.lastIndex = 0;
    });

    it("matches curly quotes", () => {
      expect(DIALOGUE_QUOTES.test("\u201CHello\u201D",),).toBe(true,);
      DIALOGUE_QUOTES.lastIndex = 0;
    });

    it("counts dialogue markers", () => {
      const text = '"He said," and "she replied"';
      const matches = [...text.matchAll(DIALOGUE_QUOTES,),];
      expect(matches.length,).toBeGreaterThanOrEqual(4,);
    });
  });

  describe("PAST_VERBS", () => {
    it.each(["was", "were", "had", "did", "went", "said", "walked", "looked", "turned", "spoke",],)(
      "matches '%s'",
      (verb,) => {
        expect(PAST_VERBS.test(`He ${verb} there.`,),).toBe(true,);
        PAST_VERBS.lastIndex = 0;
      },
    );

    it("matches multiple past verbs", () => {
      const text = "He went and spoke";
      const matches = [...text.matchAll(PAST_VERBS,),];
      expect(matches.length,).toBe(2,);
    });
  });

  describe("PRESENT_VERBS", () => {
    it.each(["is", "are", "has", "do", "go", "say", "walk", "look", "turn", "speak",],)(
      "matches '%s'",
      (verb,) => {
        expect(PRESENT_VERBS.test(`He ${verb} there.`,),).toBe(true,);
        PRESENT_VERBS.lastIndex = 0;
      },
    );
  });

  describe("ACTION_MARKER", () => {
    it("matches asterisk-wrapped actions", () => {
      expect(ACTION_MARKER.test("*attacks with sword*",),).toBe(true,);
    });

    it("does not match plain text", () => {
      expect(ACTION_MARKER.test("He attacks",),).toBe(false,);
    });
  });

  describe("FIRST_PERSON", () => {
    it.each(["I", "me", "my", "mine", "myself",],)("matches '%s'", (pronoun,) => {
      expect(FIRST_PERSON.test(`Give ${pronoun} the item.`,),).toBe(true,);
    },);

    it("does not match other pronouns", () => {
      expect(FIRST_PERSON.test("Give him the item",),).toBe(false,);
    });
  });

  describe("PROPER_NOUN", () => {
    it.each([
      ["Dark Lord", ["Dark Lord",],],
      ["King Arthur", ["King Arthur",],],
      ["The quick Brown Fox", ["The", "Brown Fox",],],
    ],)("matches '%s' → %j", (input, expected,) => {
      const matches = [...input.matchAll(PROPER_NOUN,),].map((m,) => m[0]);
      expect(matches,).toEqual(expected,);
    },);
  });

  describe("PROPER_NOUN_ENTITY", () => {
    it("matches capitalized names", () => {
      const matches = [..."Dark Lord arrived".matchAll(PROPER_NOUN_ENTITY,),].map((m,) => m[1]);
      expect(matches,).toContain("Dark Lord",);
    });
  });

  describe("SENTENCE_END", () => {
    it.each([".", "!", "?",],)("matches '%s'", (char,) => {
      expect(SENTENCE_END.test(char,),).toBe(true,);
    },);

    it("matches in context", () => {
      expect("Hello world!".split(SENTENCE_END,).length,).toBeGreaterThan(1,);
    });
  });
});
