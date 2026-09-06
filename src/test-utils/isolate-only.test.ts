// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { isolateOnly } from "./isolate-only";

describe("test-utils isolate-only", () => {
  test("isolateOnly is defined", () => {
    expect(typeof isolateOnly).toBe("function");
  });
});
