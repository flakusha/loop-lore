import { describe, expect, test, } from "bun:test";
import { renderShortcodes, } from "./emoji";

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
