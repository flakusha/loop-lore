// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mergePluginConfig, parseStoredPluginConfig, } from "./config-merge";

describe("mergePluginConfig prototype-pollution hardening", () => {
  test("stored __proto__ key cannot pollute the result or Object.prototype", () => {
    const stored = JSON.parse(`{"__proto__":{"x":1},"a":2}`);
    const result = mergePluginConfig({ a: 0, }, stored,);

    expect(result["a"],).toBe(2,);
    expect(Object.getPrototypeOf(result,),).toBeNull();
    expect(({} as Record<string, unknown>)["x"],).toBeUndefined();
    expect("x" in Object.prototype,).toBe(false);
  });

  test("dangerous own keys are skipped (constructor, hasOwnProperty)", () => {
    const result = mergePluginConfig(
      { greeting: "hi", },
      JSON.parse(`{"constructor":{"prototype":{"p":1}},"hasOwnProperty":false}`),
    );

    expect(result["greeting"],).toBe("hi",);
    expect("p" in Object.prototype,).toBe(false);
    expect(Object.hasOwn(result, "greeting",),).toBe(true);
  });

  test("nested defaults still merge under stored plain objects", () => {
    const result = mergePluginConfig(
      { section: { a: 1, b: 2, }, },
      { section: { b: 9, }, },
    );

    expect(result["section"],).toEqual({ a: 1, b: 9, },);
  });

  test("schema.required enforcement still throws on missing keys", () => {
    expect(() =>
      mergePluginConfig({}, { other: 1, }, { type: "object", properties: {}, required: ["endpoint"], },),
    ).toThrow(`Plugin config missing required key: "endpoint"`);

    // Survives when the required key comes from defaults.
    const ok = mergePluginConfig(
      { endpoint: "/hook", },
      { other: 1, },
      { type: "object", properties: {}, required: ["endpoint"], },
    );

    expect(ok["endpoint"],).toBe("/hook",);
  });

  test("parseStoredPluginConfig contract unchanged", () => {
    expect(parseStoredPluginConfig(null,),).toEqual({},);
    expect(parseStoredPluginConfig("  ",),).toEqual({},);
    expect(() => parseStoredPluginConfig(`"[1,2]"`),).toThrow();
  });
});
