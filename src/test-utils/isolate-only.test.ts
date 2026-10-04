// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test, } from "bun:test";
import { describeOrSkip, ISOLATED, requestsPerFileIsolation, } from "./isolate-only";

describe("test-utils isolate-only", () => {
  test("ISOLATED is a boolean", () => {
    expect(typeof ISOLATED,).toBe("boolean",);
  });

  test("describeOrSkip is a function", () => {
    expect(typeof describeOrSkip,).toBe("function",);
  });

  test("a per-file isolated runner invocation requests isolation", () => {
    expect(requestsPerFileIsolation("/usr/bin/bun\0test\0--isolate\0src/\0",),).toBe(true,);
    expect(requestsPerFileIsolation("/usr/bin/bun\0test\0--parallel=4\0src/\0",),).toBe(true,);
    expect(requestsPerFileIsolation("--isolate",),).toBe(true,);
  });

  test("a shared-process runner invocation does not request isolation", () => {
    expect(requestsPerFileIsolation("/usr/bin/bun\0test\0src/\0",),).toBe(false,);
    expect(requestsPerFileIsolation("/usr/bin/bun\0test\0--coverage\0src/\0",),).toBe(false,);
    expect(requestsPerFileIsolation("",),).toBe(false,);
  });

  test("argv that only looks isolated does not request isolation", () => {
    expect(requestsPerFileIsolation("/usr/bin/bun\0test\0--no-isolate\0src/\0",),).toBe(false,);
    expect(requestsPerFileIsolation("/usr/bin/bun\0test\0/tmp/x--isolate-notes.test.ts\0",),).toBe(false,);
  });
});
