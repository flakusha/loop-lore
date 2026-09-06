// SPDX-License-Identifier: LGPL-3.0-or-later
import { describe, expect, test } from "bun:test";
import { MockLLMProvider } from "./mock-provider";
describe("test-utils mock-provider", () => {
  test("MockLLMProvider is defined", () => { expect(typeof MockLLMProvider).toBe("function"); });
});
