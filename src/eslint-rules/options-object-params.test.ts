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
  // Required: `verify` only applies file-matching when a filename is given,
  // and a config with no `files` then matches nothing. Without this, every
  // case below silently returned zero messages.
  files: ["**/*.ts",],
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

// Count only this rule's reports. `verify` also returns parse errors and
// config-level fatals, which would otherwise satisfy a `toBe(1)` assertion on a
// snippet the parser rejected -- i.e. a test that passes without the logic ever
// running. A null ruleId is exactly that case, so fail loudly instead.
function violations(code: string,): number {
  const messages = linter.verify(code, config, "case.ts",);
  const fatal = messages.find((message,) => message.ruleId == null);
  if (fatal) { throw new Error(`linter did not run: ${fatal.message}`,); }
  return messages.filter((message,) => message.ruleId === "local/options-object-params").length;
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

  // --- Typed-slot exemption: a type annotation already pins the arity, so an
  // options-object rewrite would break assignability. Each case below pins a
  // BOUNDARY, not just that the exemption fires. ---

  // Proof the harness is live: this snippet has nothing to do with any
  // exemption and must still be reported. If `violations` ever silently stops
  // invoking the rule, every `toBe(0)` below becomes a false pass.
  test("SANITY: the rule still reports an unannotated 3-param function", () => {
    expect(violations("function plain(a: number, b: number, c: number) { return a + b + c; }",),).toBe(1,);
  });

  // Exempt shape A: the annotation is on the declarator itself. Block body.
  test("allows a block-bodied function assigned to a function-typed const", () => {
    const code =
      "type Fn = (a: number, b: number, c: number) => number;\nconst f: Fn = (a, b, c) => { return a + b + c; };";
    expect(violations(code,),).toBe(0,);
  });

  // Same shape with an expression body -- a different AST shape for the
  // function node, so the exemption must not depend on a block.
  test("allows an expression-bodied function assigned to a function-typed const", () => {
    const code = "type Fn = (a: number, b: number, c: number) => number;\nconst f: Fn = (a, b, c) => a + b + c;";
    expect(violations(code,),).toBe(0,);
  });

  // Exempt shape B: a method of the object literal that IS the direct
  // `return { ... }` of a function carrying a return-type annotation.
  test("allows methods of an object literal returned from a typed function", () => {
    const code = [
      "interface Api { m(a: number, b: number, c: number): number; }",
      "function make(): Api {",
      "  return { m(a, b, c) { return a + b + c; } };",
      "}",
    ].join("\n",);
    expect(violations(code,),).toBe(0,);
  });

  // Shape B via an annotated const literal -- the factory-service pattern.
  test("allows methods of an object literal bound to an annotated const", () => {
    const code = [
      "interface Api { m(a: number, b: number, c: number): number; }",
      "function make(): Api {",
      "  const self: Api = { m(a, b, c) { return a + b + c; } };",
      "  return self;",
      "}",
    ].join("\n",);
    expect(violations(code,),).toBe(0,);
  });

  // NEAR MISS 1: no annotation at all, so the rewrite is available.
  test("NEAR MISS: still flags an untyped const with 3 params", () => {
    expect(violations("const f = (a: number, b: number, c: number) => a + b + c;",),).toBe(1,);
  });

  // NEAR MISS 2: the class is exported through an annotated symbol, but no
  // interface dictates the method arity, so it is still refactorable. This is
  // the case an "is some ancestor typed" predicate would wrongly swallow.
  test("NEAR MISS: still flags a class method whose class is merely exported", () => {
    const code = [
      "export class Service {",
      "  run(a: number, b: number, c: number): number { return a + b + c; }",
      "}",
    ].join("\n",);
    expect(violations(code,),).toBe(1,);
  });

  // NEAR MISS 3: the enclosing function is annotated, but the object literal
  // is a local returned later -- nothing pins its members.
  test("NEAR MISS: still flags a method of an unannotated local literal", () => {
    const code = [
      "function make(): number {",
      "  const o = { m(a: number, b: number, c: number) { return a + b + c; } };",
      "  return o.m(1, 2, 3);",
      "}",
    ].join("\n",);
    expect(violations(code,),).toBe(1,);
  });

  // NEAR MISS 3b: the literal IS the direct return value, but the enclosing
  // function has no return-type annotation, so nothing dictates the arity.
  test("NEAR MISS: still flags a directly returned literal from an unannotated function", () => {
    const code = [
      "function make() {",
      "  return { m(a: number, b: number, c: number) { return a + b + c; } };",
      "}",
    ].join("\n",);
    expect(violations(code,),).toBe(1,);
  });

  // NEAR MISS 4: a class method stays flagged even when the class member is
  // itself annotated -- `MethodDefinition` is never an exempting parent.
  test("NEAR MISS: still flags a class property with 3 annotated params", () => {
    expect(violations("class A { f = (a: number, b: number, c: number) => a + b + c; }",),).toBe(1,);
  });

  // The exemption is scoped to the annotated slot only: a sibling function in
  // the same annotated block is still judged on its own.
  test("NEAR MISS: a sibling of an exempted slot is still flagged", () => {
    const code = [
      "interface Api { m(a: number, b: number, c: number): number; }",
      "function make(): Api {",
      "  return { m(a, b, c) { return a + b + c; } };",
      "}",
      "function free(a: number, b: number, c: number) { return a + b + c; }",
    ].join("\n",);
    expect(violations(code,),).toBe(1,);
  });
});
