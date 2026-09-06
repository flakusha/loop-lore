// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { mockProvider } from "./mock-provider";

describe("test-utils mock-provider", () => {
  test("mockProvider is defined", () => {
    expect(typeof mockProvider).toBe("function");
  });
});
