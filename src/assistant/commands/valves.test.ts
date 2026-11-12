// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { t, } from "elysia";
import { resolveCommandValves, valveSpecs, valveUsage, } from "./valves";

const FORMAT = t.Object({
  format: t.Optional(t.Union([t.Literal("concise",), t.Literal("bullets",),], { default: "concise", },),),
  count: t.Optional(t.Number({ minimum: 1, default: 10, },),),
  verbose: t.Optional(t.Boolean(),),
},);

describe("resolveCommandValves", () => {
  test("applies defaults for absent named args", () => {
    const out = resolveCommandValves({ command: "summarize", schema: FORMAT, named: {}, },);
    expect(out,).toEqual({ ok: true, values: { format: "concise", count: 10, }, },);
  });

  test("converts numeric and boolean strings", () => {
    const out = resolveCommandValves({
      command: "summarize",
      schema: FORMAT,
      named: { count: "3", verbose: "true", },
    },);

    expect(out,).toEqual({ ok: true, values: { count: 3, format: "concise", verbose: true, }, },);
  });

  test("passes literal union values through", () => {
    const out = resolveCommandValves({ command: "summarize", schema: FORMAT, named: { format: "bullets", }, },);
    expect(out,).toEqual({ ok: true, values: { format: "bullets", count: 10, }, },);
  });

  test("rejects unknown named args with expected-arg list", () => {
    const out = resolveCommandValves({ command: "summarize", schema: FORMAT, named: { colour: "red", }, },);
    expect(out.ok,).toBe(false,);
    if (!out.ok) {
      expect(out.message,).toContain("unknown argument --colour",);
      expect(out.message,).toContain("--format",);
      expect(out.message,).toContain("--count",);
    }
  });

  test("rejects type violations with a structured message", () => {
    const out = resolveCommandValves({ command: "summarize", schema: FORMAT, named: { count: "abc", }, },);
    expect(out.ok,).toBe(false,);
    if (!out.ok) {
      expect(out.message,).toContain("Expected: --format",);
    }
  });

  test("rejects literal values outside the union", () => {
    const out = resolveCommandValves({ command: "summarize", schema: FORMAT, named: { format: "sonnet", }, },);
    expect(out.ok,).toBe(false,);
  });

  test("does not mutate the caller's named map", () => {
    const named = { count: "3", };
    resolveCommandValves({ command: "s", schema: FORMAT, named, },);
    expect(named,).toEqual({ count: "3", },);
  });
});

describe("valveSpecs", () => {
  test("summarizes each property as a display spec", () => {
    expect(valveSpecs(FORMAT,),).toEqual([
      { name: "format", type: "concise|bullets", default: "concise", enum: ["concise", "bullets",], },
      { name: "count", type: "number", default: 10, },
      { name: "verbose", type: "boolean", },
    ],);
  });
});

describe("valveUsage", () => {
  test("summarizes properties, kinds and defaults", () => {
    expect(valveUsage(FORMAT,),).toBe(
      '--format (concise|bullets, default "concise"), --count (number, default 10), --verbose (boolean)',
    );
  });
});
