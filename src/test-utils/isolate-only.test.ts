// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { ISOLATED, describeOrSkip } from "./isolate-only";
describe("test-utils isolate-only", () => {
  test("ISOLATED is defined", () => { expect(typeof ISOLATED).toBe("boolean"); });
  test("describeOrSkip is defined", () => { expect(typeof describeOrSkip).toBe("function"); });
});
