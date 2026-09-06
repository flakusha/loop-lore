// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { createTestDB } from "./create-test-db";

describe("test-utils create-test-db", () => {
  test("createTestDB is defined", () => {
    expect(typeof createTestDB).toBe("function");
  });
});
