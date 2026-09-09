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

  // === Boundary / overflow edge cases ===
  // Pins for the placeholders regex family. The regexes themselves are
  // permissive; downstream consumers must enforce key/path safety. These
  // tests document the regex contract so future tightening is intentional.

  describe("DOUBLE_BRACE — boundary", () => {
    it.each([
      // empty, whitespace-only, single-char, deeply nested
      ["{{}}", 0,],
      ["{{ }}", 1,], // single space counts (capture is non-empty)
      ["{{name}}", 1,],
      ["{{a.b.c.d.e}}", 1,],
      ["{{a-b-c-d}}", 1,], // hyphens allowed
      ["{{a_b_c_d}}", 1,], // underscores allowed
      ["{{{triple}}}", 1,], // matches 'triple' (inner \{\{ consumed)
      ["{{name.with.dots.very.deeply.nested.path}}", 1,],
    ],)("match count of '%s'", (input, count,) => {
      const matches = [...input.matchAll(DOUBLE_BRACE,),];
      expect(matches.length,).toBe(count,);
    },);

    it("does not match a string with no closing braces", () => {
      const matches = [..."{{name".matchAll(DOUBLE_BRACE,),];
      expect(matches.length,).toBe(0,);
    });

    it("does not match a string with no opening braces", () => {
      const matches = [..."name}}".matchAll(DOUBLE_BRACE,),];
      expect(matches.length,).toBe(0,);
    });

    it("matches many placeholders in a row (handles count)", () => {
      const matches = [...("{{a}}{{b}}{{c}}{{d}}".matchAll(DOUBLE_BRACE,)),];
      expect(matches.length,).toBe(4,);
      expect(matches.map(m => m[1]),).toEqual(["a", "b", "c", "d",],);
    });

    it("extracts names with whitespaces around them (capture is everything between braces)", () => {
      // Pin: regex captures whatever is between {{ and }} with [^}]+.
      // Whitespace-trimming is downstream's responsibility.
      const m = DOUBLE_BRACE.exec("{{ name }}",);
      expect(m?.[1],).toBe(" name ",);
    });

    it("extracts a deeply nested path (no maximum depth)", () => {
      // Reset lastIndex: DOUBLE_BRACE has /g flag and retains state
      // across exec() calls in the same process.
      DOUBLE_BRACE.lastIndex = 0;
      const m = DOUBLE_BRACE.exec("{{a.b.c.d.e.f.g.h.i.j.k.l}}",);
      expect(m?.[1],).toBe("a.b.c.d.e.f.g.h.i.j.k.l",);
    });
  });

  describe("SINGLE_BRACE — boundary", () => {
    it("matches word-char single-brace placeholders", () => {
      const matches = [..."{name}".matchAll(SINGLE_BRACE,),];
      expect(matches.map(m => m[1]),).toEqual(["name",],);
    });

    it("does NOT match hyphenated names (\w only)", () => {
      // Pin: SINGLE_BRACE disallows hyphens. Use DOUBLE_BRACE or the
      // downstream path-helper accepts hyphens explicitly.
      const matches = [..."{a-b}".matchAll(SINGLE_BRACE,),];
      expect(matches.length,).toBe(0,);
    });

    it("does NOT match dotted paths", () => {
      const matches = [..."{name.b}".matchAll(SINGLE_BRACE,),];
      expect(matches.length,).toBe(0,);
    });

    it("matches {0} (digits allowed in \w)", () => {
      expect([..."{0}".matchAll(SINGLE_BRACE,),][0]?.[1],).toBe("0",);
    });

    it("matches within '{{name}}' as '{name}' (overlapping bracket patterns)", () => {
      // Both DOUBLE_BRACE and SINGLE_BRACE match '{{name}}'. SINGLE_BRACE
      // finds '{name}' inside (the outer '{' is consumed by DOUBLE_BRACE).
      // Documenting this overlap so a single-brace-only parser knows.
      const matches = [..."{{name}}".matchAll(SINGLE_BRACE,),];
      expect(matches.length,).toBe(1,);
      expect(matches[0]?.[0],).toBe("{name}",);
    });
  });

  describe("MENTION — boundary", () => {
    it("matches alphanumeric + underscores + hyphens", () => {
      const matches = [..."@alice @bob_c @charlie-b".matchAll(MENTION,),];
      expect(matches.map(m => m[1]),).toEqual(["alice", "bob_c", "charlie-b",],);
    });

    it("does not match @-only (no body)", () => {
      const matches = [..."@".matchAll(MENTION,),];
      expect(matches.length,).toBe(0,);
    });
    it("captures @a when followed by .b (first segment wins)", () => {
      // Pin: '@a.b' matches '@a' (the regex stops at '.' which is not in
      // the allowed character class). The trailing '.b' is unmatched.
      const matches = [..."@a.b".matchAll(MENTION,),];
      expect(matches.length,).toBe(1,);
      expect(matches[0]?.[1],).toBe("a",);
    });

    it("captures the first segment before '@' (chained at-mentions)", () => {
      // '@a@b' → first match is 'a', '@b' does NOT match because the
      // second '@' starts a new mention capture.
      const matches = [..."@a@b".matchAll(MENTION,),];
      expect(matches.map(m => m[1]),).toEqual(["a", "b",],);
    });

    it("is case-sensitive (Alice vs alice)", () => {
      const matches = [..."@Alice @alice".matchAll(MENTION,),];
      // Pin: case-sensitive. Resolution to canonical user-id is downstream.
      expect(matches.length,).toBe(2,);
      expect(matches[0]?.[1],).toBe("Alice",);
      expect(matches[1]?.[1],).toBe("alice",);
    });

    it("handles huge mention names (no max length)", () => {
      const name = "x".repeat(1000,);
      const matches = [...`@${name}`.matchAll(MENTION,),];
      expect(matches.length,).toBe(1,);
      expect(matches[0]?.[1]?.length,).toBe(1000,);
    });
  });

  describe("MENTION_AT_END — boundary", () => {
    it("matches an incomplete trailing @ with empty body", () => {
      const m = MENTION_AT_END.exec("hello @",);
      expect(m?.[1],).toBe("",);
    });

    it("matches a partial name at end", () => {
      const m = MENTION_AT_END.exec("hello @al",);
      expect(m?.[1],).toBe("al",);
    });

    it("does not match when '@' is not the last non-whitespace", () => {
      // The regex has no \s anchor, so a trailing space before @ counts.
      expect(MENTION_AT_END.exec("@end",)?.[1],).toBe("end",);
      // With trailing space, the @ is no longer at end.
      expect(MENTION_AT_END.exec("hello @ ",),).toBeNull();
    });

    it("stops at the first non-word character", () => {
      // '@abc@' → last '@' starts a fresh partial match. So '@abc' is the
      // partial tail before the second '@'.
      const m = MENTION_AT_END.exec("@abc@",);
      expect(m?.[1],).toBe("",);
    });
  });

  describe("WORKFLOW_TAG — strictness", () => {
    it.each([
      "character:image",
      "character:video",
      "item:image",
      "item:video",
      "monster:image",
      "monster:video",
      "location:image",
      "location:video",
    ],)("matches '%s'", (input,) => {
      const m = WORKFLOW_TAG.exec(input,);
      expect(m,).not.toBeNull();
    },);

    it.each([
      ["CHARACTER:IMAGE", null,], // case-sensitive
      ["Character:Image", null,], // case-sensitive
      ["character", null,], // missing modality
      [":image", null,], // missing kind
      ["character:image:foo", null,], // extra segment
      ["character: image", null,], // whitespace between segments
      ["character:audio", null,], // unsupported modality
      ["other:image", null,], // unknown kind
      ["", null,],
      ["character:", null,], // missing modality
      [":image", null,],
    ],)("rejects '%s'", (input,) => {
      expect(WORKFLOW_TAG.exec(input,),).toBeNull();
    },);

    it("captures kind and modality in named groups", () => {
      const m = WORKFLOW_TAG.exec("character:image",);
      expect(m?.groups?.kind,).toBe("character",);
      expect(m?.groups?.modality,).toBe("image",);
    });
  });

  describe("OBJECT_TYPE — boundary", () => {
    it("extracts custom class names from toString output", () => {
      expect(OBJECT_TYPE.exec("[object MyClass]",)?.[1],).toBe("MyClass",);
    });

    it("rejects strings with no leading '[object '", () => {
      expect(OBJECT_TYPE.exec("Array",),).toBeNull();
      expect(OBJECT_TYPE.exec("[object]",),).toBeNull();
    });

    it("rejects multi-word type labels (regex anchored at end)", () => {
      // OBJECT_TYPE = /^\[object (\S+)\]$/ — anchored at end, so the
      // capture is constrained to a single non-space token. Multi-word
      // toString output like '[object Symbol Foo]' is rejected because
      // the trailing ']' requires the prior token to be a single word.
      expect(OBJECT_TYPE.exec("[object Symbol Foo]",),).toBeNull();
    });
  });
});
