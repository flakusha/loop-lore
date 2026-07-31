import { describe, expect, it } from "bun:test";
import { TITLE_TAG, INCLUDE_DIRECTIVE, ICON_DIRECTIVE, I18N_DIRECTIVE, HTML_EXTENSION } from "./template";

describe("template regex", () => {
  describe("TITLE_TAG", () => {
    it("matches <title>...</title>", () => {
      expect(TITLE_TAG.test("<title>My Page</title>")).toBe(true);
    });

    it("matches <title> with nested tags", () => {
      expect("<title>Chat — Loop Lore</title>".replace(TITLE_TAG, "<title>New</title>")).toBe("<title>New</title>");
    });

    it("does not match unmatched tags", () => {
      expect(TITLE_TAG.test("<div>title</div>")).toBe(false);
    });
  });

  describe("INCLUDE_DIRECTIVE", () => {
    it.each([
      ["{{> components/header }}", "components/header"],
      ["{{>partial-name}}", "partial-name"],
      ["{{> characters/create-modal }}", "characters/create-modal"],
    ])("matches %s → captures %s", (input, expected) => {
      const match = INCLUDE_DIRECTIVE.exec(input);
      expect(match?.[1]).toBe(expected);
      INCLUDE_DIRECTIVE.lastIndex = 0;
    });

    it("matches globally", () => {
      const text = "{{> a}} {{> b/c}}";
      const matches = [...text.matchAll(INCLUDE_DIRECTIVE)];
      expect(matches.length).toBe(2);
      expect(matches.map((m) => m[1])).toEqual(["a", "b/c"]);
    });
  });

  describe("ICON_DIRECTIVE", () => {
    it.each([
      ["{{icon:user}}", "user"],
      ["{{icon:arrow-left}}", "arrow-left"],
      ["{{icon:check-circle}}", "check-circle"],
    ])("matches %s → captures %s", (input, expected) => {
      const match = ICON_DIRECTIVE.exec(input);
      expect(match?.[1]).toBe(expected);
      ICON_DIRECTIVE.lastIndex = 0;
    });

    it("replaces icon directives", () => {
      const result = "Click {{icon:user}} to continue".replace(ICON_DIRECTIVE, "ICON");
      expect(result).toBe("Click ICON to continue");
    });
  });

  describe("I18N_DIRECTIVE", () => {
    it.each([
      ['{{{t("errors.notFound")}}}', "errors.notFound"],
      ['{{{t("chat.send")}}}', "chat.send"],
    ])("matches %s → captures %s", (input, expected) => {
      const match = I18N_DIRECTIVE.exec(input);
      expect(match?.[1]).toBe(expected);
      I18N_DIRECTIVE.lastIndex = 0;
    });

    it("replaces i18n directives", () => {
      const result = '{{{t("hello")}}} world'.replace(I18N_DIRECTIVE, "Hello");
      expect(result).toBe("Hello world");
    });
  });

  describe("HTML_EXTENSION", () => {
    it.each(["chat.html", "layout.htm", "index.HTML"])("matches %s", (input) => {
      expect(HTML_EXTENSION.test(input)).toBe(true);
    });

    it("does not match non-HTML files", () => {
      expect(HTML_EXTENSION.test("style.css")).toBe(false);
      expect(HTML_EXTENSION.test("script.js")).toBe(false);
    });
  });
});
