// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { expandMacros, } from "./engine";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

const REGISTRY = {
  char: "Aria",
  user: "Mora",
  greet: () => "hello",
  nested: "says {{char}}",
  injection: "{{char}}",
  dollar: "$& $1 $$",
};

describe("expandMacros", () => {
  test("expands a single macro", () => {
    expect(expandMacros("Hello {{char}}!", REGISTRY,),).toBe("Hello Aria!",);
  });

  test("expands multiple macros in one string", () => {
    expect(expandMacros("{{user}} greets {{char}}", REGISTRY,),).toBe("Mora greets Aria",);
  });

  test("invokes lazy resolvers only when referenced", () => {
    let calls = 0;
    const registry = {
      lazy: () => {
        calls++;
        return "x";
      },
      other: "y",
    };

    expect(expandMacros("{{other}}", registry,),).toBe("y",);
    expect(calls,).toBe(0,);
    expect(expandMacros("{{lazy}}", registry,),).toBe("x",);
    expect(calls,).toBe(1,);
  });

  test("keeps unknown macros literal", () => {
    expect(expandMacros("{{unknownMacro}} stays", REGISTRY,),).toBe("{{unknownMacro}} stays",);
  });

  test("keeps empty tokens literal", () => {
    expect(expandMacros("{{}} and {{   }}", REGISTRY,),).toBe("{{}} and {{   }}",);
  });

  test("trims whitespace around macro names", () => {
    expect(expandMacros("{{ char }}", REGISTRY,),).toBe("Aria",);
  });

  test("escapes a macro with one backslash", () => {
    expect(expandMacros("\\{{char}}", REGISTRY,),).toBe("{{char}}",);
  });

  test("keeps an even backslash run literal and expands the macro", () => {
    expect(expandMacros("\\\\{{char}}", REGISTRY,),).toBe("\\\\Aria",);
  });

  test("expands the innermost macro of a nested token", () => {
    expect(expandMacros("outer {{char{{user}}}} end", REGISTRY,),).toBe("outer {{charMora}} end",);
  });

  test("does not rescan values in literal mode", () => {
    expect(expandMacros("value: {{injection}}", REGISTRY,),).toBe("value: {{char}}",);
  });

  test("expands values in expand-values mode", () => {
    expect(expandMacros("she {{nested}}", REGISTRY, { mode: "expand-values", },),).toBe("she says Aria",);
  });

  test("matches names exactly when trimNames is off (legacy template semantics)", () => {
    expect(expandMacros("{{ char }} stays", REGISTRY, { trimNames: false, },),).toBe("{{ char }} stays",);
    expect(expandMacros("{{char}} goes", REGISTRY, { trimNames: false, },),).toBe("Aria goes",);
  });

  test("expands through one backslash when escapes are off (legacy template semantics)", () => {
    expect(expandMacros("\\{{char}}", REGISTRY, { escapes: false, },),).toBe("\\Aria",);
  });

  test("is safe against replacement-pattern pitfalls", () => {
    expect(expandMacros("pay {{dollar}}", REGISTRY,),).toBe("pay $& $1 $$",);
  });

  test("leaves input without tokens unchanged", () => {
    const text = "plain words and {single} braces";
    expect(expandMacros(text, REGISTRY,),).toBe(text,);
  });

  test("propagates a throwing lazy resolver", () => {
    const registry = {
      boom: () => {
        throw new Error("resolver failed",);
      },
    };

    expect(() => expandMacros("{{boom}}", registry,)).toThrow("resolver failed",);
  });
});
