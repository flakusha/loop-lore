// Focused logger coverage
import { describe, expect, it, } from "bun:test";
import { createLogger, getLogger, setGlobalLogger, } from "./index";

describe("logger coverage", () => {
  it("createLogger returns instance", () => {
    const log = createLogger({ level: "info", },);
    expect(log,).toBeDefined();
    expect(typeof log.info,).toBe("function",);
  });
  it("getLogger returns created logger", () => {
    createLogger();
    const log = getLogger();
    expect(log,).toBeDefined();
  });
  it("getLogger throws before init", () => {
    setGlobalLogger(null as any,);
    expect(() => getLogger()).toThrow("Logger not initialized",);
  });
  it("setGlobalLogger replaces root", () => {
    const log = createLogger({ level: "debug", },);
    setGlobalLogger(log,);
    expect(getLogger(),).toBe(log,);
  });
});
