// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the new-chat page state helpers. Both are pure, so no
 * DOM harness or module mocks are needed.
 */
import { describe, expect, test, } from "bun:test";
import { hasValidationHarness, isGroup, } from "./state";

describe("hasValidationHarness", () => {
  test("true for the llm_only variants", () => {
    expect(hasValidationHarness("llm_only",),).toBe(true,);
    expect(hasValidationHarness("llm_only_group",),).toBe(true,);
  });

  test("false for every other variant", () => {
    expect(hasValidationHarness("standard",),).toBe(false,);
    expect(hasValidationHarness("llm_only_group_gm",),).toBe(false,);
    expect(hasValidationHarness("",),).toBe(false,);
  });
});

describe("isGroup", () => {
  test("true when chatType is group", () => {
    expect(isGroup({ chatType: { value: "group", }, } as never,),).toBe(true,);
  });

  test("false otherwise", () => {
    expect(isGroup({ chatType: { value: "solo", }, } as never,),).toBe(false,);
    expect(isGroup({} as never,),).toBe(false,);
  });
});
