// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin route-path policy (BUG-fix-plugins-define-plugin-route-matching-semantics).
 *
 * Plugin routes are matched by exact normalized path, so two things must be
 * true: `/widget/` and `/widget` are the same route, and a `:param` path is
 * rejected at registration instead of silently never matching.
 *
 * RESOURCE CONTRACT (parallel-safe): pure path predicates — no registry
 * singleton mutation, no DB, no port, no file.
 */
import { describe, expect, test, } from "bun:test";
import { assertPluginRoutePath, normalizePluginRoutePath, } from "./registry-policy";

describe("normalizePluginRoutePath", () => {
  test("collapses a trailing slash", () => {
    expect(normalizePluginRoutePath("/widget/",),).toBe("/widget",);
    expect(normalizePluginRoutePath("/api/plugins/w/",),).toBe("/api/plugins/w",);
  });

  test("leaves an already-normalized path alone", () => {
    expect(normalizePluginRoutePath("/widget",),).toBe("/widget",);
    expect(normalizePluginRoutePath("/widget/sub",),).toBe("/widget/sub",);
  });

  test("preserves the root path", () => {
    // `/` is one character, not a trailing slash to strip.
    expect(normalizePluginRoutePath("/",),).toBe("/",);
  });

  test("is idempotent", () => {
    const once = normalizePluginRoutePath("/widget/",);

    expect(normalizePluginRoutePath(once,),).toBe(once,);
  });
});

describe("assertPluginRoutePath", () => {
  test("accepts a path without parameters", () => {
    expect(() => assertPluginRoutePath("demo", "/widget",),).not.toThrow();
    expect(() => assertPluginRoutePath("demo", "/widget/sub",),).not.toThrow();
    expect(() => assertPluginRoutePath("demo", "/",),).not.toThrow();
  });

  test("rejects a :param segment, naming the plugin and the path", () => {
    expect(() => assertPluginRoutePath("demo", "/widget/:id",),).toThrow(/"demo"/,);
    expect(() => assertPluginRoutePath("demo", "/widget/:id",),).toThrow("/widget/:id",);

    let message = "";
    try {
      assertPluginRoutePath("demo", "/:tenant/widget",);
    } catch (error) {
      message = (error as Error).message;
    }

    // The error has to tell the plugin author what to do instead.
    expect(message,).toContain("query string",);
  });

  test("only a segment-initial colon counts (exact-match semantics)", () => {
    // `a:b` is an ordinary path segment at match time, not a URL parameter.
    expect(() => assertPluginRoutePath("demo", "/widget/a:b",),).not.toThrow();
    expect(() => assertPluginRoutePath("demo", "/widget/:id/sub",),).toThrow(/:param/,);
  });
});
