// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { parseCommand, } from "./command-parser";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("command-parser", () => {
  describe("parseCommand", () => {
    test("parses simple command", () => {
      const result = parseCommand("/help",);
      expect(result,).toEqual({ args: [], command: "help", named: {}, positional: [], raw: "/help", },);
    });

    test("parses command with args", () => {
      const result = parseCommand("/roll 2d6+3",);
      expect(result,).toEqual({
        args: ["2d6+3",],
        command: "roll",
        named: {},
        positional: ["2d6+3",],
        raw: "/roll 2d6+3",
      },);
    });

    test("parses command with multiple args", () => {
      const result = parseCommand("/roll 2d6+3 advantage",);
      expect(result,).toEqual({
        command: "roll",
        args: ["2d6+3", "advantage",],
        named: {},
        positional: ["2d6+3", "advantage",],
        raw: "/roll 2d6+3 advantage",
      },);
    });

    test("returns null for non-slash input", () => {
      expect(parseCommand("hello",),).toBeNull();
    });

    test("returns null for bare slash", () => {
      expect(parseCommand("/",),).toBeNull();
    });

    test("lowercases command name", () => {
      const result = parseCommand("/ROLL 2d6",);
      expect(result?.command,).toBe("roll",);
    });

    test("trims whitespace", () => {
      const result = parseCommand("  /roll 2d6  ",);
      expect(result,).toEqual({
        args: ["2d6",],
        command: "roll",
        named: {},
        positional: ["2d6",],
        raw: "/roll 2d6",
      },);
    });

    test("splits on any whitespace including tabs", () => {
      // Tab-separated commands used to parse as one token and never dispatch.
      expect(parseCommand("/roll\t2d6",),).toEqual({
        args: ["2d6",],
        command: "roll",
        named: {},
        positional: ["2d6",],
        raw: "/roll\t2d6",
      },);

      expect(parseCommand("/roll\n2d6",),).toEqual({
        args: ["2d6",],
        command: "roll",
        named: {},
        positional: ["2d6",],
        raw: "/roll\n2d6",
      },);
    });

    test("handles extra whitespace between args", () => {
      const result = parseCommand("/roll  2d6   +3",);
      expect(result,).toEqual({
        args: ["2d6", "+3",],
        command: "roll",
        named: {},
        positional: ["2d6", "+3",],
        raw: "/roll  2d6   +3",
      },);
    });
  });

  describe("named arguments", () => {
    test("parses --key value", () => {
      const result = parseCommand("/rewrite --style dark some text",);
      expect(result?.named,).toEqual({ style: "dark", },);
      expect(result?.positional,).toEqual(["some", "text",],);
    });

    test("parses --key=value", () => {
      const result = parseCommand("/summarize --format=bullets",);
      expect(result?.named,).toEqual({ format: "bullets", },);
      expect(result?.positional,).toEqual([],);
    });

    test("parses --flag with no value as empty string", () => {
      const result = parseCommand("/rewrite --apply",);
      expect(result?.named,).toEqual({ apply: "", },);
      expect(result?.positional,).toEqual([],);
    });

    test("a value token starting with -- is not consumed", () => {
      const result = parseCommand("/cmd --a --b x",);
      expect(result?.named,).toEqual({ a: "", b: "x", },);
    });

    test("quotes group a named value", () => {
      const result = parseCommand('/rewrite --style "dark hero" keep this',);
      expect(result?.named,).toEqual({ style: "dark hero", },);
      expect(result?.positional,).toEqual(["keep", "this",],);
      expect(result?.args,).toEqual(["--style", "dark hero", "keep", "this",],);
    });

    test("parses --key with a quoted value inline", () => {
      const result = parseCommand('/rewrite --style="dark hero" tail',);
      expect(result?.named,).toEqual({ style: "dark hero", },);
      expect(result?.positional,).toEqual(["tail",],);
    });

    test("lowercases named keys", () => {
      const result = parseCommand("/cmd --Style dark",);
      expect(result?.named,).toEqual({ style: "dark", },);
    });

    test("keeps non-flag tokens containing = positional", () => {
      // Dice notation and free text never parse as named args.
      const result = parseCommand("/whatif 1+1=2 wins",);
      expect(result?.named,).toEqual({},);
      expect(result?.positional,).toEqual(["1+1=2", "wins",],);
      expect(result?.args,).toEqual(["1+1=2", "wins",],);
    });

    test("keeps args as the full token list for legacy handlers", () => {
      const result = parseCommand("/rewrite --style dark --apply",);
      expect(result?.args,).toEqual(["--style", "dark", "--apply",],);
      expect(result?.named,).toEqual({ apply: "", style: "dark", },);
      expect(result?.positional,).toEqual([],);
    });

    test("unterminated quote consumes the rest as one token", () => {
      const result = parseCommand('/narrate "open quote stays',);
      expect(result?.positional,).toEqual(["open quote stays",],);
    });

    test("empty --key= yields empty value", () => {
      const result = parseCommand("/cmd --style=",);
      expect(result?.named,).toEqual({ style: "", },);
    });
  });
});
