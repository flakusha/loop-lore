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
});
