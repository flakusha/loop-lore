// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./create-test-db";

describe("test-utils create-test-db", () => {
  test("createTestDb is defined and callable", () => {
    expect(typeof createTestDb).toBe("function");
  });
  test("createTestDb returns a Promise", async () => {
    const result = createTestDb();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});
