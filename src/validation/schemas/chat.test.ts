// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat update schema regression tests.
 *
 * Bug: BUG-promptoverride-schema-has-no-maxlength-token-bomb-storage-ve
 *
 * `promptOverride` previously accepted an unbounded string; a client could
 * PUT an arbitrarily large value stored in `chats.prompt_override` and
 * injected into the system prompt on every generation (token bomb). The
 * field is now capped (20k chars); null still clears it.
 */

import { describe, expect, test, } from "bun:test";
import { Value, } from "@sinclair/typebox/value";
import { ChatUpdateBody, } from "./chat";

/**
 * @param promptOverride
 */
function bodyWith(promptOverride: unknown,) {
  return { promptOverride, };
}

describe("ChatUpdateBody.promptOverride", () => {
  test("accepts a null override (clear)", () => {
    expect(Value.Check(ChatUpdateBody, bodyWith(null),),).toBe(true,);
  });

  test("accepts an override at the 20k cap", () => {
    expect(Value.Check(ChatUpdateBody, bodyWith("x".repeat(20_000,),),),).toBe(true,);
  });

  test("rejects an override above the cap", () => {
    expect(Value.Check(ChatUpdateBody, bodyWith("x".repeat(20_001,),),),).toBe(false,);
  });
});
