// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { validatePluginManifest, warnOnInvalidManifest, } from "./manifest-validator";

function validManifest(): Record<string, unknown> {
  return {
    name: "test-plugin",
    version: "1.0.0",
    description: "A test plugin",
    author: "Tester",
    tools: [{ name: "t", description: "d", parameters: {}, handler: async () => ({ content: "ok", }), },],
    agentRoles: [{ id: "r", name: "R", description: "d", systemPrompt: "p", tools: [], },],
    apiRoutes: [{ method: "GET", path: "/x", handler: async () => null, permissions: ["admin.settings",], },],
  };
}

describe("validatePluginManifest", () => {
  test("accepts a valid manifest", () => {
    expect(validatePluginManifest(validManifest(),)).toEqual([],);
  });

  test("ignores unknown fields (no closed schema)", () => {
    expect(validatePluginManifest({ ...validManifest(), future: 1, },)).toEqual([],);
  });

  test("rejects non-objects", () => {
    expect(validatePluginManifest(null,)).toEqual(["manifest must be an object",]);
    expect(validatePluginManifest("x",)).toEqual(["manifest must be an object",]);
  });

  test("requires name/version/description/author", () => {
    const errors = validatePluginManifest({},);
    expect(errors,).toContain("name is required",);
    expect(errors,).toContain("version is required",);
    expect(errors,).toContain("description is required",);
    expect(errors,).toContain("author is required",);
  });

  test("rejects empty strings and misshapen sections", () => {
    const errors = validatePluginManifest({
      name: "", version: "1", description: "d", author: "a",
      tools: [{ name: "", },],
      agentRoles: "nope",
      apiRoutes: [{ method: "BREW", path: "", handler: "x", permissions: [1,], },],
      migrations: [{ version: "1", },],
      onLoad: "now",
    },);

    expect(errors.length,).toBeGreaterThan(5,);
    expect(errors.join("\n"),).toContain("tools[0].name",);
    expect(errors.join("\n"),).toContain("agentRoles must be an array",);
    expect(errors.join("\n"),).toContain("apiRoutes[0].method",);
    expect(errors.join("\n"),).toContain("migrations[0].version",);
    expect(errors.join("\n"),).toContain("onLoad must be a function",);
  });

  test("accepts a minimal manifest with no optional sections", () => {
    expect(validatePluginManifest({ name: "n", version: "1", description: "d", author: "a", },)).toEqual([],);
  });

  test("warnOnInvalidManifest warns once and reports skip", () => {
    const seen: string[][] = [];
    expect(warnOnInvalidManifest({ name: "n", version: "1", description: "d", author: "a", }, () => {},),).toBe(false,);
    expect(
      warnOnInvalidManifest({ name: "n", }, (msg, meta,) => {
        seen.push([msg, JSON.stringify(meta,)],);
      }, { origin: "core", },),
    ).toBe(true,);

    expect(seen.length,).toBe(1,);
    expect(seen[0]?.[0],).toBe("Invalid plugin manifest — skipping",);
    expect(seen[0]?.[1],).toContain(`"origin":"core"`,);
  });
});
