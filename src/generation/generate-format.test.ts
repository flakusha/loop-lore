// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { ChatFormatTemplate, } from "../config/sections/templates";
import { applyChatFormat, } from "./generate-format";
import type { GenerationMessage, } from "./types";

const CHATML: ChatFormatTemplate = {
  system: "<|im_start|>system\n${content}<|im_end|>",
  user: "<|im_start|>user\n${content}<|im_end|>",
  assistant: "<|im_start|>assistant\n${content}<|im_end|>",
};

describe("applyChatFormat", () => {
  test("passthrough when no wrapper set for a role", () => {
    const empty: ChatFormatTemplate = { system: "", user: "", assistant: "", };
    const msgs: GenerationMessage[] = [
      { role: "system", content: "act as helpful", },
      { role: "user", content: "hello", },
      { role: "assistant", content: "hi there", },
    ];
    const out = applyChatFormat(msgs, empty,);
    expect(out[0]!.content,).toBe("act as helpful",);
    expect(out[1]!.content,).toBe("hello",);
    expect(out[2]!.content,).toBe("hi there",);
  });

  test("wraps system/user/assistant, character maps to assistant, tool unchanged", () => {
    const msgs: GenerationMessage[] = [
      { role: "system", content: "act as helpful", },
      { role: "user", content: "hello", },
      { role: "assistant", content: "hi there", },
      { role: "character", content: "i am roleplaying", },
      { role: "tool", content: '{"result": 42}', tool_call_id: "call_1", },
    ];
    const out = applyChatFormat(msgs, CHATML,);
    expect(out[0]!.content,).toBe("<|im_start|>system\nact as helpful<|im_end|>",);
    expect(out[1]!.content,).toBe("<|im_start|>user\nhello<|im_end|>",);
    expect(out[2]!.content,).toBe("<|im_start|>assistant\nhi there<|im_end|>",);
    expect(out[3]!.content,).toBe("<|im_start|>assistant\ni am roleplaying<|im_end|>",);
    expect(out[4]!.content,).toBe('{"result": 42}',);
    expect(out[4]!.tool_call_id,).toBe("call_1",);
  });
});
