// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { fineTuneState, } from "./fine-tune";
import { providerState, } from "./providers";
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

describe("model suitability size parsing", () => {
  test("modelSuitability parses B-suffixed sizes for capability tiers", () => {
    expect(providerState.modelSuitability!.call({}, { id: "m", paramSize: "8B", },),).toContain("Capable",);
    expect(providerState.modelSuitability!.call({}, { id: "m", paramSize: "13B", },),).toContain("Capable",);
    expect(providerState.modelSuitability!.call({}, { id: "m", paramSize: "110M", },),).toContain("Lightweight",);
  });

  test("fineTuneReadiness parses B-suffixed sizes for base tiers", () => {
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("13B",),),).toContain("large param",);
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("8B",),),).toContain("large param",);
    expect(fineTuneState.fineTuneReadiness!.call({}, candidate("110M",),),).toContain("prefer a larger model",);
  });
});
