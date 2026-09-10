// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { fineTuneState, } from "./fine-tune";
import type { FineTuneCandidate, } from "./types";

function candidate(paramSize: string | null,): FineTuneCandidate {
  return {
    provider: "p",
    model: "m",
    paramSize,
    contextWindow: null,
    maxOutput: null,
    modalities: [],
    thinking: false,
    toolCalling: false,
    ownedBy: null,
  };
}

describe("fineTuneReadiness B-suffixed sizes", () => {
  test("parses uppercase B suffix into size tiers", () => {
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("7B",),),).toContain("mid-size",);
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("13B",),),).toContain("large param",);
  });

  test("parses lowercase b suffix", () => {
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("7b",),),).toContain("mid-size",);
  });

  test("keeps plain numeric sizes working", () => {
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("13",),),).toContain("large param",);
  });
});
