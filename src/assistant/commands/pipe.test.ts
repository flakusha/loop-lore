// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { MAX_PIPE_STAGES, pipeNone, pipeText, pipeTextOf, splitPipeChain, } from "./pipe";
import type { CommandResult, } from "./registry";

describe("splitPipeChain", () => {
  test("splits on top-level pipes", () => {
    expect(splitPipeChain("/roll 2d6 | /summarize --format bullets",),).toEqual([
      "/roll 2d6 ",
      " /summarize --format bullets",
    ],);
  });

  test("keeps quoted pipes inside one segment", () => {
    expect(splitPipeChain('/narrate "a | b" | /roll d20',),).toEqual([
      '/narrate "a | b" ',
      " /roll d20",
    ],);
  });

  test("keeps an escaped pipe literal", () => {
    const segments = splitPipeChain("/narrate a \\| b",);
    expect(segments,).toEqual(["/narrate a \\| b",],);
  });

  test("splits every top-level pipe regardless of content", () => {
    // The splitter is content-agnostic; the dispatcher only applies it when
    // the first segment parses as a command.
    expect(splitPipeChain("just talking about a | b | c",),).toEqual([
      "just talking about a ",
      " b ",
      " c",
    ],);
  });

  test("returns one segment when there is no pipe", () => {
    expect(splitPipeChain("/roll 2d6",),).toEqual(["/roll 2d6",],);
  });

  test("handles a trailing pipe as an empty final segment", () => {
    expect(splitPipeChain("/roll 2d6 |",),).toEqual(["/roll 2d6 ", "",],);
  });
});

describe("pipeTextOf", () => {
  const base: CommandResult = { handled: true, };

  test("falls back to the system message", () => {
    expect(pipeTextOf({ ...base, systemMessage: "rolled 7", },),).toBe("rolled 7",);
  });

  test("falls back to empty when nothing to pipe", () => {
    expect(pipeTextOf(base,),).toBe("",);
  });

  test("explicit text emit wins over the system message", () => {
    expect(pipeTextOf({ ...base, systemMessage: "shown", pipe: pipeText("piped",), },),).toBe("piped",);
  });

  test("none emit pipes empty even with a system message", () => {
    expect(pipeTextOf({ ...base, systemMessage: "shown", pipe: pipeNone(), },),).toBe("",);
  });
});

describe("chain guard", () => {
  test("depth cap is finite", () => {
    expect(MAX_PIPE_STAGES,).toBeLessThan(64,);
    expect(MAX_PIPE_STAGES,).toBeGreaterThan(1,);
  });
});
