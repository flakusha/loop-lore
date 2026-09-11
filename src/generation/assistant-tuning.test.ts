// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  parseAssistantTuning,
  resolveAssistantMaxTokens,
  resolveAssistantTemperature,
} from "./assistant-tuning";

describe("parseAssistantTuning", () => {
  test("missing or malformed blob degrades to no override", () => {
    expect(parseAssistantTuning(null,),).toEqual({ temperature: null, maxTokens: null, },);
    expect(parseAssistantTuning("not-json",),).toEqual({ temperature: null, maxTokens: null, },);
    expect(parseAssistantTuning("{}",),).toEqual({ temperature: null, maxTokens: null, },);
  });
  test("valid sub-key validates each axis independently", () => {
    expect(
      parseAssistantTuning(JSON.stringify({ assistantTuning: { temperature: 0.3, maxTokens: 512, }, },),),
    ).toEqual({ temperature: 0.3, maxTokens: 512, },);
    expect(
      parseAssistantTuning(JSON.stringify({ assistantTuning: { temperature: 99, maxTokens: -5, }, },),),
    ).toEqual({ temperature: null, maxTokens: null, },);
  });
});

describe("resolve precedence", () => {
  test("explicit wins, then override, then undefined", () => {
    expect(resolveAssistantTemperature(0.1, 0.5,),).toBe(0.1,);
    expect(resolveAssistantTemperature(undefined, 0.5,),).toBe(0.5,);
    expect(resolveAssistantTemperature(undefined, null,),).toBeUndefined();
    expect(resolveAssistantMaxTokens(100, 500,),).toBe(100,);
    expect(resolveAssistantMaxTokens(undefined, 500,),).toBe(500,);
    expect(resolveAssistantMaxTokens(undefined, null,),).toBeUndefined();
  });
  test("out-of-range explicit degrades to override", () => {
    expect(resolveAssistantTemperature(99, 0.5,),).toBe(0.5,);
  });
});
