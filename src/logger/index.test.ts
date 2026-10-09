// Focused logger coverage
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { createLogger, getChildLogger, getLogger, type Logger, setGlobalLogger, } from "./index";

/** Global root capture — restored after each test so global mutation never leaks across files. */
let prevRoot: Logger | undefined;
beforeEach(() => {
  try {
    prevRoot = getLogger();
  } catch {
    prevRoot = undefined;
  }
},);

afterEach(() => {
  if (prevRoot) {
    setGlobalLogger(prevRoot,);
  } else {
    createLogger({ level: "error", },);
  }

  prevRoot = undefined;
},);

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

  it("getChildLogger returns null before init", () => {
    setGlobalLogger(undefined as unknown as Logger,);
    expect(getChildLogger("test",),).toBeNull();
  });

  it("getChildLogger returns cached child for same name", () => {
    createLogger({ level: "info", },);
    const first = getChildLogger("module-a",);
    const second = getChildLogger("module-a",);
    expect(first,).not.toBeNull();
    expect(second,).toBe(first,);
  });

  it("getChildLogger returns distinct children for different names", () => {
    createLogger({ level: "info", },);
    const a = getChildLogger("module-a",);
    const b = getChildLogger("module-b",);
    expect(a,).not.toBeNull();
    expect(b,).not.toBeNull();
    expect(a,).not.toBe(b,);
  });

  it("getChildLogger cache is invalidated when root is replaced", () => {
    const root1 = createLogger({ level: "info", },);
    const child1 = getChildLogger("module-a",);
    expect(child1,).not.toBeNull();
    // Replace root — cache should rebuild on next call
    const root2 = createLogger({ level: "debug", },);
    setGlobalLogger(root2,);
    const child2 = getChildLogger("module-a",);
    expect(child2,).not.toBeNull();
    // Same name but different root → new child instance
    expect(child2,).not.toBe(child1,);
  });
});
