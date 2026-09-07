import { describe, expect, test, } from "bun:test";
// Import attaches THEMES to globalThis (side effect under test).
import "./theme";

describe("theme registry", () => {
  test("exposes the theme list on globalThis for the bundler", () => {
    const themes = (globalThis as unknown as { __THEMES?: { id: string; name: string; file: string }[] })
      .__THEMES;
    expect(Array.isArray(themes,),).toBe(true,);
    expect(themes,).toHaveLength(10,);
    const ids = themes!.map((t,) => t.id);
    expect(new Set(ids,).size,).toBe(10,);
    for (const theme of themes!) {
      expect(theme.name.length,).toBeGreaterThan(0,);
      expect(theme.file,).toMatch(/^theme-.*\.css$/,);
    }
  });

  test("includes the default and no-icons themes", () => {
    const themes = (globalThis as unknown as { __THEMES?: { id: string }[] }).__THEMES!;
    expect(themes.some((t,) => t.id === "default"),).toBe(true,);
    expect(themes.some((t,) => t.id === "no-icons"),).toBe(true,);
  });
});
