import { describe, expect, it } from "bun:test";
import {
  SLUG_SAFE,
  FILENAME_SAFE,
  STRIP_QUOTES,
  STRIP_HTML_TAGS,
  DOUBLE_SPACES,
  SPACE_BEFORE_PUNCT,
  REMOVE_DATA_TESTID,
  REMOVE_COLON_DATA_TESTID,
  REMOVE_SVG_CLASS,
  GITDIR_LINE,
  MODEL_SIZE,
  HASHED_ASSET,
  HASH_FILENAME,
  KEYWORD_SPLIT,
  GREETING_FILLER,
  PROPER_NOUN_EXTRACT,
} from "./slugs";

describe("slugs regex", () => {
  describe("SLUG_SAFE", () => {
    it("replaces non-alphanumeric with underscore", () => {
      expect("Hello World!".replaceAll(SLUG_SAFE, "_")).toBe("Hello_World_");
    });

    it("preserves alphanumeric", () => {
      expect("abc123".replaceAll(SLUG_SAFE, "_")).toBe("abc123");
    });
  });

  describe("FILENAME_SAFE", () => {
    it("replaces non-word chars", () => {
      expect("file name!@#".replaceAll(FILENAME_SAFE, "_")).toBe("file_name_");
    });

    it("preserves dots and hyphens", () => {
      expect("file-name.test".replaceAll(FILENAME_SAFE, "_")).toBe("file-name.test");
    });
  });

  describe("STRIP_QUOTES", () => {
    it("strips double quotes", () => {
      expect('"hello"'.replaceAll(STRIP_QUOTES, "")).toBe("hello");
    });

    it("strips single quotes", () => {
      expect("'hello'".replaceAll(STRIP_QUOTES, "")).toBe("hello");
    });

    it("does not strip mid-string quotes", () => {
      expect("he said 'hi' there".replaceAll(STRIP_QUOTES, "")).toBe("he said 'hi' there");
    });
  });

  describe("STRIP_HTML_TAGS", () => {
    it("strips simple tags", () => {
      expect("<p>Hello</p>".replaceAll(STRIP_HTML_TAGS, "")).toBe("Hello");
    });

    it("strips self-closing tags", () => {
      expect("Hello<br/>World".replaceAll(STRIP_HTML_TAGS, "")).toBe("HelloWorld");
    });
  });

  describe("DOUBLE_SPACES", () => {
    it("collapses double spaces", () => {
      expect("hello  world".replaceAll(DOUBLE_SPACES, " ")).toBe("hello world");
    });

    it("collapses multiple spaces", () => {
      expect("a   b   c".replaceAll(DOUBLE_SPACES, " ")).toBe("a b c");
    });
  });

  describe("SPACE_BEFORE_PUNCT", () => {
    it("removes space before punctuation", () => {
      expect("hello , world !".replaceAll(SPACE_BEFORE_PUNCT, "$1")).toBe("hello, world!");
    });
  });

  describe("REMOVE_DATA_TESTID", () => {
    it("removes data-testid attribute", () => {
      const html = '<div data-testid="foo" class="bar">';
      expect(html.replaceAll(REMOVE_DATA_TESTID, "")).toBe('<div class="bar">');
    });
  });

  describe("REMOVE_COLON_DATA_TESTID", () => {
    it("removes :data-testid attribute", () => {
      const html = '<div :data-testid="foo" class="bar">';
      expect(html.replaceAll(REMOVE_COLON_DATA_TESTID, "")).toBe('<div class="bar">');
    });
  });

  describe("REMOVE_SVG_CLASS", () => {
    it("removes class attribute from SVG", () => {
      const svg = '<svg class="icon-tabler">';
      expect(svg.replaceAll(REMOVE_SVG_CLASS, "")).toBe("<svg>");
    });
  });

  describe("GITDIR_LINE", () => {
    it("extracts gitdir path", () => {
      const content = "gitdir: /path/to/main/.git/worktrees/branch";
      expect(GITDIR_LINE.exec(content)?.[1]).toBe("/path/to/main/.git/worktrees/branch");
    });

    it("returns null for non-gitdir content", () => {
      expect(GITDIR_LINE.exec("ref: refs/heads/main")).toBeNull();
    });
  });

  describe("MODEL_SIZE", () => {
    it.each([
      ["gpt-4-10B", "10B"],
      ["model-1.5b", "1.5b"],
      ["70B-instruct", "70B"],
    ])("extracts size from '%s'", (input, expected) => {
      expect(MODEL_SIZE.exec(input)?.[1]).toBe(expected);
    });
  });

  describe("HASHED_ASSET", () => {
    it("matches hashed JS files", () => {
      expect(HASHED_ASSET.test("alpine-tx4kdwfm.js")).toBe(true);
    });

    it("matches hashed CSS files", () => {
      expect(HASHED_ASSET.test("style-abc12345.css")).toBe(true);
    });

    it("does not match non-hashed files", () => {
      expect(HASHED_ASSET.test("alpine.js")).toBe(false);
    });
  });

  describe("HASH_FILENAME", () => {
    it("extracts parts from hashed filename", () => {
      const match = HASH_FILENAME.exec("main-abc12345.js");
      expect(match?.[1]).toBe("main");
      expect(match?.[2]).toBe("abc12345");
      expect(match?.[3]).toBe("js");
    });
  });

  describe("KEYWORD_SPLIT", () => {
    it("splits on non-alphanumeric", () => {
      expect("hello-world test".split(KEYWORD_SPLIT)).toEqual(["hello", "world", "test"]);
    });
  });

  describe("GREETING_FILLER", () => {
    it.each(["hey", "hi", "hello", "yo", "sup", "what's up", "so", "well", "um", "uh", "like"])(
      "strips '%s'",
      (greeting) => {
        expect(`${greeting} what do you think`.replace(GREETING_FILLER, "")).toBe(
          "what do you think",
        );
      },
    );

    it("returns full string if no greeting", () => {
      expect("What do you think".replace(GREETING_FILLER, "")).toBe("What do you think");
    });
  });

  describe("PROPER_NOUN_EXTRACT", () => {
    it("extracts capitalized words", () => {
      const matches = [..."Dark Lord arrived".matchAll(PROPER_NOUN_EXTRACT)].map((m) => m[0]);
      expect(matches).toContain("Dark Lord");
    });
  });
});
