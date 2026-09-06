import { describe, expect, it, } from "bun:test";
import { createLogger, } from "../../../logger";
import { attemptSeduction, } from "./attempt";

describe("rpg/seduction/service/attempt (real logic call)", () => {
  createLogger({ mode: "silent", level: "fatal", },);

  it("calls attemptSeduction and validates result shape", async () => {
    const result = await attemptSeduction({} as any, {
      actorId: "a",
      targetId: "t",
      skillCategory: "social",
      approach: "talk",
      worldId: "w",
    },);
    expect(result,).toBeDefined();
    expect(typeof result.success,).toBe("boolean",);
    expect(typeof result.checkResult,).toBe("number",);
    expect(typeof result.attempted,).toBe("boolean",);
  });
});
