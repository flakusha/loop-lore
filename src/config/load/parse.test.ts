// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Contract tests for config parsing + object helpers. */
import { describe, expect, test, } from "bun:test";
import {
  coerceValue,
  deepMerge,
  getTypeOfPath,
  normalizeConfig,
  parseFileContent,
  setByPath,
} from "./parse";

describe("deepMerge", () => {
  test("overrides win over base scalars; base keys are kept", () => {
    expect(deepMerge({ a: 1, b: "keep", }, { a: 2, },),).toEqual({ a: 2, b: "keep", },);
  });

  test("nested objects merge recursively instead of replacing", () => {
    expect(deepMerge(
      { server: { host: "0.0.0.0", port: 3000, }, },
      { server: { host: "0.0.0.0", port: 8080, }, },
    ),).toEqual({ server: { host: "0.0.0.0", port: 8080, }, },);
  });

  test("undefined overrides are skipped; arrays replace instead of merging", () => {
    expect(deepMerge({ a: 1, list: [1, 2,], }, { a: undefined, list: [3,], },),).toEqual({ a: 1, list: [3,], },);
  });

  test("null override replaces the base value", () => {
    expect(deepMerge({ a: 1, }, { a: null, },),).toEqual({ a: null, },);
  });
});

describe("setByPath", () => {
  test("sets nested paths, creating intermediate objects", () => {
    const obj: Record<string, unknown> = {};
    setByPath(obj, "server.port", 8080,);
    expect(obj,).toEqual({ server: { port: 8080, }, },);
  });

  test("existing intermediate objects are preserved", () => {
    const obj: Record<string, unknown> = { server: { host: "h", }, };
    setByPath(obj, "server.port", 1,);
    expect(obj,).toEqual({ server: { host: "h", port: 1, }, },);
  });

  test("scalar intermediates are replaced by objects", () => {
    const obj: Record<string, unknown> = { server: "oops", };
    setByPath(obj, "server.port", 1,);
    expect(obj,).toEqual({ server: { port: 1, }, },);
  });
});

describe("coerceValue", () => {
  test("number targets parse to numbers", () => {
    expect(coerceValue("42", "number",),).toBe(42,);
    expect(coerceValue("", "number",),).toBe(0,);
  });

  test("boolean targets accept true/1 and false/0, pass through anything else", () => {
    expect(coerceValue("true", "boolean",),).toBe(true,);
    expect(coerceValue("1", "boolean",),).toBe(true,);
    expect(coerceValue("false", "boolean",),).toBe(false,);
    expect(coerceValue("0", "boolean",),).toBe(false,);
    expect(coerceValue("yes", "boolean",),).toBe("yes",);
  });

  test("other targets pass the string through unchanged", () => {
    expect(coerceValue("abc", "string",),).toBe("abc",);
    expect(coerceValue("123", "string",),).toBe("123",);
  });
});

describe("getTypeOfPath", () => {
  const obj = { server: { port: 8080, name: null, }, tags: ["a",], };

  test("reports the typeof of the resolved path", () => {
    expect(getTypeOfPath(obj, "server.port",),).toBe("number",);
    expect(getTypeOfPath(obj, "server",),).toBe("object",);
    expect(getTypeOfPath(obj, "server.name",),).toBe("object",); // null
    expect(getTypeOfPath(obj, "tags",),).toBe("object",);
  });

  test("missing or non-traversable paths fall back to string", () => {
    expect(getTypeOfPath(obj, "server.port.deeper",),).toBe("string",);
    expect(getTypeOfPath(obj, "nope.nada",),).toBe("string",); // undefined intermediate
  });
});

describe("parseFileContent", () => {
  test("parses yaml and yml", () => {
    expect(parseFileContent("server:\n  port: 8080\n", "yaml",),).toEqual({ server: { port: 8080, }, },);
    expect(parseFileContent("server:\n  port: 8080\n", "yml",),).toEqual({ server: { port: 8080, }, },);
  });

  test("parses toml", () => {
    expect(parseFileContent("[server]\nport = 8080\n", "toml",),).toEqual({ server: { port: 8080, }, },);
  });

  test("rejects unknown extensions", () => {
    expect(() => parseFileContent("{}", "json",)).toThrow("Unknown config file extension: .json",);
  });
});

describe("normalizeConfig", () => {
  test("strips null and empty-string leaves so defaults survive", () => {
    expect(normalizeConfig({ a: "", b: null, c: 1, },),).toEqual({ c: 1, },);
  });

  test("recurses into nested objects but preserves arrays", () => {
    expect(normalizeConfig({ server: { host: "", port: 1, }, tags: ["", "x",], },),).toEqual(
      { server: { port: 1, }, tags: ["", "x",], },
    );
  });

  test("drops empty objects entirely only leaf-by-leaf (empty objects are preserved)", () => {
    expect(normalizeConfig({ nested: {}, },),).toEqual({ nested: {}, },);
  });
});
