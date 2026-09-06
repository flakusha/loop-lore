// Full logger
import { describe, expect, it, } from "bun:test";
import { createLogger, } from "../logger";
import { LoggerImpl, } from "./logger";
describe("logger full", () => {
  it("impl creates", () => {
    const l = new LoggerImpl({ level: "info", },);
    expect(l,).toBeDefined();
  });
  it("child log", () => {
    const log = createLogger();
    const child = log.child({ requestId: "r1", },);
    expect(child,).toBeDefined();
  });
});
