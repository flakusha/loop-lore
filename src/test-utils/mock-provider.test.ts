// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { MockLLMProvider } from "./mock-provider";

describe("test-utils mock-provider", () => {
  test("MockLLMProvider is a constructor", () => {
    expect(typeof MockLLMProvider).toBe("function");
  });
  test("MockLLMProvider can be instantiated", () => {
    const instance = new MockLLMProvider({} as any);
    expect(instance).toBeDefined();
  });
});
