import { describe, expect, test, } from "bun:test";
import { describe, expect, test, } from "bun:test";
import { existsSync, readFileSync, } from "node:fs";
import { existsSync, readFileSync, } from "node:fs";
import { join, } from "node:path";

const VIEWS_DIR = join(import.meta.dir, "..", "views",);
const ROUTES_DIR = import.meta.dir;
const COMPONENTS_DIR = join(import.meta.dir, "..", "components",);

describe("views search endpoints", () => {
  test("views.ts has gallery search endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "views.ts",), "utf8",);
    expect(content,).toContain("/dynamic/gallery/search",);
    expect(content,).toContain("serveGallerySearch",);
  });

  test("views.ts has characters search endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "views.ts",), "utf8",);
    expect(content,).toContain("/dynamic/characters/search",);
    expect(content,).toContain("serveCharactersSearch",);
  });

  test("views.ts has worlds search endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "views.ts",), "utf8",);
    expect(content,).toContain("/dynamic/worlds/search",);
    expect(content,).toContain("serveWorldsSearch",);
  });
});

describe("view templates use HTMX search", () => {
  test("gallery.html has filter-bar component", () => {
    const content = readFileSync(join(VIEWS_DIR, "gallery.html",), "utf8",);
    expect(content,).toContain("filter-bar.html",);
    expect(content,).toContain("hx-indicator",);
  });

  test("characters.html has filter-bar component", () => {
    const content = readFileSync(join(VIEWS_DIR, "characters.html",), "utf8",);
    expect(content,).toContain("filter-bar.html",);
    expect(content,).toContain("hx-indicator",);
  });

  test("worlds.html has filter-bar component", () => {
    const content = readFileSync(join(VIEWS_DIR, "worlds.html",), "utf8",);
    expect(content,).toContain("filter-bar.html",);
    expect(content,).toContain("hx-indicator",);
  });
});

describe("components exist", () => {
  test("filter-bar.html exists", () => {
    expect(existsSync(join(COMPONENTS_DIR, "filter-bar.html",),),).toBe(true,);
  });

  test("filter-chips.html exists", () => {
    expect(existsSync(join(COMPONENTS_DIR, "filter-chips.html",),),).toBe(true,);
  });

  test("empty-state.html exists", () => {
    expect(existsSync(join(COMPONENTS_DIR, "empty-state.html",),),).toBe(true,);
  });

  test("load-more.html exists", () => {
    expect(existsSync(join(COMPONENTS_DIR, "load-more.html",),),).toBe(true,);
  });
});
