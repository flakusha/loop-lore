// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Linter, } from "eslint";
import tseslint from "typescript-eslint";
import { optionsObjectParamsRule, } from "./options-object-params.mjs";

const linter = new Linter();

const config: Linter.Config = {
  languageOptions: {
    parser: tseslint.parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
  plugins: {
    local: { rules: { "options-object-params": optionsObjectParamsRule, }, },
  },
  rules: { "local/options-object-params": "warn", },
};

function violations(code: string,): number {
  return linter.verify(code, config,).length;
}

describe("options-object-params rule", () => {
  test("flags a function with 3 positional params", () => {
    expect(violations("function f(a, b, c) {}",),).toBe(1,);
  });

  test("flags an arrow with 3 positional params", () => {
    expect(violations("const f = (a, b, c) => {};",),).toBe(1,);
  });

  test("flags default params as positional", () => {
    expect(violations("function f(a, b = 1, c = 2) {}",),).toBe(1,);
  });

  test("flags array-pattern params as positional", () => {
    expect(violations("function f([a], b, c) {}",),).toBe(1,);
  });

  // Regression: class member values are traversed as ordinary function nodes,
  // so a dedicated member visitor double-reported them.
  test("reports a class method exactly once", () => {
    expect(violations("class A { m(a, b, c) {} }",),).toBe(1,);
  });

  test("reports a class property arrow exactly once", () => {
    expect(violations("class A { f = (a, b, c) => {}; }",),).toBe(1,);
  });

  test("reports an object method once", () => {
    expect(violations("const o = { m(a, b, c) {} };",),).toBe(1,);
  });

  test("allows a destructured options object", () => {
    expect(violations("function f({ a, b, c }) {}",),).toBe(0,);
  });

  test("allows 2 params", () => {
    expect(violations("function f(a, b) {}",),).toBe(0,);
  });

  test("allows a trailing rest param", () => {
    expect(violations("function f(a, b, ...rest) {}",),).toBe(0,);
  });

  test("allows an options object mixed with 2 positional params", () => {
    expect(violations("function f({ a }, b, c) {}",),).toBe(0,);
  });

  test("ignores overload signatures, flagging only the implementation", () => {
    const code =
      "function f(a: number, b: number, c: number): void;\nfunction f(a: number, b: number, c: number): void {}";
    expect(violations(code,),).toBe(1,);
  });

  test("ignores abstract method signatures", () => {
    expect(violations("abstract class A { abstract m(a: number, b: number, c: number): void; }",),).toBe(0,);
  });

  test("ignores declare signatures", () => {
    expect(violations("declare function f(a: number, b: number, c: number): void;",),).toBe(0,);
  });

  // Parameter properties cannot be destructured, so they are exempt.
  test("ignores constructor parameter properties", () => {
    const code = "class A { constructor(private a: number, private b: number, private c: number) {} }";
    expect(violations(code,),).toBe(0,);
  });

  test("flags a plain constructor with 3 positional params", () => {
    expect(violations("class A { constructor(a, b, c) {} }",),).toBe(1,);
  });

  // A TS `this` parameter is not a real argument.
  test("ignores a TS this parameter", () => {
    expect(violations("function f(this: Window, a: number, b: number) {}",),).toBe(0,);
  });

  test("counts real params after a TS this parameter", () => {
    expect(violations("function f(this: Window, a: number, b: number, c: number) {}",),).toBe(1,);
  });
});
