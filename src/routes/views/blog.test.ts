/**
 * Tests for the blog view wiring (auto-discovery, template hooks, sidebar link).
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { ALLOWED_VIEWS, VIEWS_DIR, } from "./constants";
import { serveView, } from "./index";

describe("views/blog — discovery and serving", () => {
  test("blog is an allowed view via auto-discovery", () => {
    expect(ALLOWED_VIEWS.has("blog",),).toBe(true,);
  });

  test("serveView serves the blog template with grid hooks", async () => {
    const res = serveView("blog", true,);
    expect(res,).not.toBeNull();
    const html = await res!.text();
    expect(html,).toContain('data-testid="blog-grid"',);
    expect(html,).toContain('data-testid="blog-header"',);
    expect(html,).toContain('x-data="blogPage()"',);
    expect(html,).toContain('data-testid="create-post"',);
  });

  test("unknown view still returns null", () => {
    expect(serveView("blog-nope", true,),).toBeNull();
  });
});

describe("views/layout — blog sidebar link", () => {
  const layout = readFileSync(join(VIEWS_DIR, "layout.html",), "utf8",);

  test("sidebar links to /views/blog", () => {
    expect(layout,).toContain('data-testid="nav-blog"',);
    expect(layout,).toContain('hx-get="/views/blog"',);
  });
});
