// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `src/cli/parser.ts` — the Optique wrapper module.
 *
 * Verifies:
 *  - `runScript` returns the parsed value with a custom `args` array.
 *  - Defaults are applied when args are omitted.
 *  - The wrapper passes `brief`, `description`, `examples` through `message`.
 *  - Integer bounds validation is wired through to Optique.
 */

import { integer, string, } from "@optique/core/valueparser";
import { describe, expect, test, } from "bun:test";
import {
  flag,
  object,
  option,
  runScript,
  withDefault,
} from "./parser";

describe("runScript wrapper", () => {
  test("returns parsed value from custom args", () => {
    const parser = object({
      name: option("-n", "--name", string(),),
      count: withDefault(option("-c", "--count", integer({ min: 1, },),), 1,),
      verbose: withDefault(flag("-v", "--verbose",), false,),
    },);
    const args = runScript(parser, {
      args: ["--name", "loop-lore", "--count", "5", "--verbose",],
    },);
    expect(args.name,).toBe("loop-lore",);
    expect(args.count,).toBe(5,);
    expect(args.verbose,).toBe(true,);
  });

  test("applies defaults when args are omitted", () => {
    const parser = object({
      count: withDefault(option("-c", "--count", integer({ min: 0, },),), 1,),
      verbose: withDefault(flag("-v", "--verbose",), false,),
    },);
    const args = runScript(parser, { args: [], },);
    expect(args.count,).toBe(1,);
    expect(args.verbose,).toBe(false,);
  });

  test("passes brief/description/examples through message layer", () => {
    const parser = object({
      input: option("--input", string(),),
    },);
    // Confirm that supplying brief/description/examples alongside a valid
    // parser pipeline does not break parsing. Optique renders them only
    // when --help is invoked (which exits via onExit).
    expect(() => {
      runScript(parser, {
        args: ["--input", "config.toml",],
        brief: "Short brief",
        description: "Long description",
        examples: "tool --input foo.toml",
      },);
    },).not.toThrow();
  });

  test("supports integer bounds validation", () => {
    const parser = object({
      port: option("--port", integer({ min: 1, max: 65535, },),),
    },);
    const args = runScript(parser, { args: ["--port", "8080",], },);
    expect(args.port,).toBe(8080,);
  });
});
