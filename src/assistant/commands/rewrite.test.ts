/**
 * Rewrite Command Tests.
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import { createLogger, } from "../../logger";
import { getCommand, } from "./registry";
import { rewriteText, } from "./rewrite";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("rewrite command", () => {
  it("is registered", () => {
    expect(getCommand("rewrite",),).toBeDefined();
  });

  describe("rewriteText", () => {
    it("trims excess whitespace in clear style", () => {
      const out = rewriteText("  Hello   world  ", "clear",);
      expect(out,).toBe("Hello world.",);
    });

    it("removes filler words in concise style", () => {
      const out = rewriteText("I just really want to go.", "concise",);
      expect(out,).toBe("I want to go.",);
    });

    it("capitalizes emotional words in dramatic style", () => {
      const out = rewriteText("It was suddenly dark.", "dramatic",);
      expect(out,).toContain("SUDDENLY",);
    });

    it("expands contractions in formal style", () => {
      const out = rewriteText("I can't do it.", "formal",);
      expect(out,).toBe("I cannot do it.",);
    });

    it("appends sentence-ending punctuation when missing", () => {
      const out = rewriteText("Hello world", "clear",);
      expect(out,).toBe("Hello world.",);
    });
  });
});
