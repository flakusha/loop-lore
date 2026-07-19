import { BUILTIN_COMMANDS, isBuiltinCommand, parseCommand, } from "./command-parser";
import { beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";

beforeAll(() => {
  createLogger({ level: "error", },);
},);

describe("command-parser", () => {
  describe("parseCommand", () => {
    test("parses simple command", () => {
      const result = parseCommand("/help",);
      expect(result,).toEqual({ command: "help", args: [], raw: "/help", },);
    });

    test("parses command with args", () => {
      const result = parseCommand("/roll 2d6+3",);
      expect(result,).toEqual({ command: "roll", args: ["2d6+3",], raw: "/roll 2d6+3", },);
    });

    test("parses command with multiple args", () => {
      const result = parseCommand("/roll 2d6+3 advantage",);
      expect(result,).toEqual({
        command: "roll",
        args: ["2d6+3", "advantage",],
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
      expect(result,).toEqual({ command: "roll", args: ["2d6",], raw: "/roll 2d6", },);
    });

    test("handles extra whitespace between args", () => {
      const result = parseCommand("/roll  2d6   +3",);
      expect(result,).toEqual({ command: "roll", args: ["2d6", "+3",], raw: "/roll  2d6   +3", },);
    });
  });

  describe("isBuiltinCommand", () => {
    test("returns true for known commands", () => {
      expect(isBuiltinCommand("help",),).toBe(true,);
      expect(isBuiltinCommand("roll",),).toBe(true,);
      expect(isBuiltinCommand("dice",),).toBe(true,);
      expect(isBuiltinCommand("clear",),).toBe(true,);
      expect(isBuiltinCommand("stats",),).toBe(true,);
      expect(isBuiltinCommand("improve",),).toBe(true,);
    });

    test("returns false for unknown commands", () => {
      expect(isBuiltinCommand("attack",),).toBe(false,);
      expect(isBuiltinCommand("foo",),).toBe(false,);
    });

    test("is case-insensitive", () => {
      expect(isBuiltinCommand("HELP",),).toBe(true,);
      expect(isBuiltinCommand("Roll",),).toBe(true,);
    });
  });

  describe("BUILTIN_COMMANDS", () => {
    test("contains expected commands", () => {
      expect(BUILTIN_COMMANDS,).toContain("help",);
      expect(BUILTIN_COMMANDS,).toContain("roll",);
      expect(BUILTIN_COMMANDS,).toContain("dice",);
      expect(BUILTIN_COMMANDS,).toContain("clear",);
      expect(BUILTIN_COMMANDS,).toContain("stats",);
      expect(BUILTIN_COMMANDS,).toContain("improve",);
    });
  });
});
