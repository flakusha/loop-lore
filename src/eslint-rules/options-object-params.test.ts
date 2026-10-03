// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Linter, } from "eslint";
import tseslint from "typescript-eslint";
import { optionsObjectParamsRule, } from "./options-object-params.mjs";

// Resource contract: every case is a pure `Linter.verify` call over an inline
// snippet. No tmp files, ports, databases or cross-test mutable state, so the
// suite is order-independent and safe under `bun test --parallel --isolate`.
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

// Count only this rule's reports. `verify` also returns parse errors, which
// would otherwise satisfy a `toBe(1)` assertion on a snippet the parser
// rejected -- i.e. a test that passes without the logic ever running.
function violations(code: string,): number {
  return linter.verify(code, config,)
    .filter((message,) => message.ruleId === "local/options-object-params")
    .length;
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

  // --- Boundary: the cap is 3 and is INCLUSIVE ---

  test("flags a function at exactly the cap (3 params)", () => {
    expect(violations("function f(a, b, c) {}",),).toBe(1,);
  });

  test("allows a function at zero params", () => {
    expect(violations("function f() {}",),).toBe(0,);
  });

  // --- Multi-line signatures must not evade the rule ---

  test("flags a multi-line signature at exactly the cap", () => {
    const code = "function f(\n  a,\n  b,\n  c,\n) {}";
    expect(violations(code,),).toBe(1,);
  });

  test("flags a multi-line signature above the cap", () => {
    const code = "function f(\n  a,\n  b,\n  c,\n  d,\n  e,\n) {}";
    expect(violations(code,),).toBe(1,);
  });

  // Arity is judged on runtime params, not on annotation character count.
  test("flags a multi-line typed signature above the cap", () => {
    const code = "function f(\n  a: Alpha,\n  b: Beta,\n  c: Gamma,\n  d: Delta,\n  e: Epsilon,\n) {}";
    expect(violations(code,),).toBe(1,);
  });

  test("allows a multi-line signature below the cap", () => {
    const code = "function f(\n  a,\n  b,\n) {}";
    expect(violations(code,),).toBe(0,);
  });

  // --- Long annotations alone must not trip the rule ---

  test("allows 2 params with very long type annotations", () => {
    const code = "function f(a: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, b: BBBBBBBBBBBBBBBBBBBBBBBBBBBBB) {}";
    expect(violations(code,),).toBe(0,);
  });

  test("flags 3 params with very long type annotations", () => {
    const code =
      "function f(a: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, b: BBBBBBBBBBBBBBBBBBBBBBBBBBBBB, c: CCCCCCCCCCCCCCCCCCCCC) {}";
    expect(violations(code,),).toBe(1,);
  });

  // --- async / generator are ordinary functions: the cap applies ---

  test("flags an async function with 3 positional params", () => {
    expect(violations("async function f(a, b, c) {}",),).toBe(1,);
  });

  test("allows an async function with 2 positional params", () => {
    expect(violations("async function f(a, b) {}",),).toBe(0,);
  });

  test("flags an async arrow with 3 positional params", () => {
    expect(violations("const f = async (a, b, c) => {};",),).toBe(1,);
  });

  test("flags a generator function with 3 positional params", () => {
    expect(violations("function* f(a, b, c) { yield a; }",),).toBe(1,);
  });

  test("allows a generator that already takes an options object", () => {
    expect(violations("function* f({ a, b, c }) {}",),).toBe(0,);
  });

  // --- Options-object exemption, including the defaulted form ---

  test("allows a destructured options object with renamed keys", () => {
    expect(violations("function f({ a: x, b: y, c: z }) {}",),).toBe(0,);
  });

  // `{ c, d } = {}` parses as AssignmentPattern(ObjectPattern, {}). The default
  // must not turn an existing options object into a positional param.
  test("allows a DEFAULTED destructured options object", () => {
    expect(violations("function f(a, b, { c, d } = {}) {}",),).toBe(0,);
  });

  test("allows a defaulted destructured options object alone", () => {
    expect(violations("function f({ a, b, c } = {}) {}",),).toBe(0,);
  });

  // A default on a plain identifier IS still one positional param.
  test("flags a defaulted options-shaped param with 2 more positionals", () => {
    expect(violations("function f(a, b, opts = {}) {}",),).toBe(1,);
  });

  // --- Rest params are not themselves counted ---

  test("allows a rest-only signature", () => {
    expect(violations("function f(...rest) {}",),).toBe(0,);
  });

  // The rest element is excluded from the count; a, b and c are not.
  test("flags 3 positional params before a rest param", () => {
    expect(violations("function f(a, b, c, ...rest) {}",),).toBe(1,);
  });

  test("allows an array-pattern param with 1 more positional", () => {
    expect(violations("function f([a], b) {}",),).toBe(0,);
  });

  // --- Class members: reported exactly once, never doubled ---

  test("reports a static class method once", () => {
    expect(violations("class A { static m(a, b, c) {} }",),).toBe(1,);
  });

  test("reports a private class method once", () => {
    expect(violations("class A { #m(a, b, c) {} }",),).toBe(1,);
  });

  test("allows a getter", () => {
    expect(violations("class A { get x() { return 1; } }",),).toBe(0,);
  });

  test("ignores 4 constructor parameter properties", () => {
    const code =
      "class A { constructor(private a: number, private b: number, private c: number, private d: number) {} }";
    expect(violations(code,),).toBe(0,);
  });

  // --- More bodiless signatures ---

  test("ignores interface call signatures", () => {
    expect(violations("interface I { (a: number, b: number, c: number): void }",),).toBe(0,);
  });

  test("ignores type-literal function signatures", () => {
    expect(violations("type T = (a: number, b: number, c: number) => void;",),).toBe(0,);
  });

  // --- Misc TypeScript param forms ---

  test("flags 3 optional params at the cap", () => {
    expect(violations("function f(a?: number, b?: number, c?: number) {}",),).toBe(1,);
  });

  test("flags 3 params in a type annotation", () => {
    expect(violations("function f(a: string, b: number, c: Foo<Bar>) {}",),).toBe(1,);
  });

  // --- Nested functions are judged independently ---

  test("reports nested functions separately", () => {
    expect(violations("function outer(a, b, c) { function inner(x, y, z) {} }",),).toBe(2,);
  });
});
