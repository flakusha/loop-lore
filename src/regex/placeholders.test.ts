import { describe, expect, it, } from "bun:test";
import {
  DOUBLE_BRACE,
  MENTION,
  MENTION_AT_END,
  OBJECT_TYPE,
  SINGLE_BRACE,
  WORKFLOW_TAG,
} from "./placeholders";

describe("placeholders regex", () => {
  describe("DOUBLE_BRACE", () => {
    it("extracts variable name", () => {
      expect(DOUBLE_BRACE.exec("{{name}}",)?.[1],).toBe("name",);
      DOUBLE_BRACE.lastIndex = 0;
    });

    it("extracts nested path", () => {
      expect(DOUBLE_BRACE.exec("{{user.name}}",)?.[1],).toBe("user.name",);
      DOUBLE_BRACE.lastIndex = 0;
    });

    it("replaces all placeholders", () => {
      const vars: Record<string, string> = { name: "World", place: "Loop Lore", };
      const result = "Hello {{name}}, welcome to {{place}}".replace(
        DOUBLE_BRACE,
        (_, key: string,) => vars[key] ?? key,
      );
      expect(result,).toBe("Hello World, welcome to Loop Lore",);
    });
  });

  describe("SINGLE_BRACE", () => {
    it("extracts variable name", () => {
      expect(SINGLE_BRACE.exec("{name}",)?.[1],).toBe("name",);
      SINGLE_BRACE.lastIndex = 0;
    });

    it("replaces placeholders", () => {
      const result = "Hello {name}".replace(SINGLE_BRACE, "World",);
      expect(result,).toBe("Hello World",);
    });
  });

  describe("WORKFLOW_TAG", () => {
    it.each([
      ["character:image", { kind: "character", modality: "image", },],
      ["item:video", { kind: "item", modality: "video", },],
      ["monster:image", { kind: "monster", modality: "image", },],
      ["location:image", { kind: "location", modality: "image", },],
    ],)("parses '%s'", (input, expected,) => {
      const match = WORKFLOW_TAG.exec(input,);
      expect(match?.groups?.kind,).toBe(expected.kind,);
      expect(match?.groups?.modality,).toBe(expected.modality,);
    },);

    it("returns null for invalid tags", () => {
      expect(WORKFLOW_TAG.exec("character:audio",),).toBeNull();
      expect(WORKFLOW_TAG.exec("weapon:image",),).toBeNull();
    });
  });

  describe("MENTION", () => {
    it("extracts single-word mention", () => {
      const match = MENTION.exec("Hello @Alice",);
      expect(match?.[1],).toBe("Alice",);
      MENTION.lastIndex = 0;
    });

    it("extracts multiple mentions", () => {
      const text = "@Alice and @Bob are here";
      const matches = [...text.matchAll(MENTION,),].map((m,) => m[1]);
      expect(matches,).toEqual(["Alice", "Bob",],);
    });
  });

  describe("MENTION_AT_END", () => {
    it("matches @ at end of string", () => {
      expect(MENTION_AT_END.exec("Hello @",)?.[1],).toBe("",);
    });

    it("matches partial name at end", () => {
      expect(MENTION_AT_END.exec("Hello @Ali",)?.[1],).toBe("Ali",);
    });

    it("returns null if no @", () => {
      expect(MENTION_AT_END.exec("Hello",),).toBeNull();
    });
  });

  describe("OBJECT_TYPE", () => {
    it("extracts type from toString", () => {
      const match = OBJECT_TYPE.exec("[object Array]",);
      expect(match?.[1],).toBe("Array",);
    });

    it("returns null for non-toString", () => {
      expect(OBJECT_TYPE.exec("Array",),).toBeNull();
    });
  });
});
