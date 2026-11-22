// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Injected-caller tests for formatMinimaxPrompt: no module mocks, no ports. */
import { describe, expect, it, } from "bun:test";
import type { GenerationMessage, } from "../gen-types-options";
import {
  formatMinimaxPrompt,
  type MinimaxFormatDeps,
  type MinimaxFormatInput,
} from "./prompt-format";

const UNALIGNED = `integrated_multimodal_description: [Shot 1] Cinematic, a wide shot opens the scene.
[Shot 2] At 00:03.500, the camera cuts to a close-up.

overall_soundscape: Light rain and distant traffic.

non_diegetic_music: N/A`;

const ALIGNMENT =
  "How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 8.00-second mark of the target video.";

const CONFORMING = `${ALIGNMENT}\n\n${UNALIGNED}`;

const ALIGNED =
  `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 8.00-second mark of the target video.

integrated_multimodal_description: [Shot 1] A cyclist starts from Picture 1. [Shot 2] At 00:08.000, the cyclist settles into Picture 2.

overall_soundscape: Light rain.

non_diegetic_music: N/A`;

const INPUT: MinimaxFormatInput = {
  mode: "fl2va",
  details: "a cyclist opens an umbrella in the rain",
  durationSeconds: 8,
};

const REF_CONFORMING = `subject_definitions:
<Subject 1> is the yellow plane in <Picture 1>.
summary:
A five-second cinematic aviation clip.
retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - the plane is retained.
detailed_description:
[Shot 1] A wide shot frames the yellow plane climbing.
[Shot 2] At 00:02.000, the propeller fills the frame.
overall_soundscape:
Straining engine and wind.
non_diegetic_music:
N/A`;

function withCaller(responses: Array<string | null>,) {
  const calls: GenerationMessage[][] = [];
  let index = 0;
  const call = (async (_task: string, _config: unknown, _db: unknown, messages: GenerationMessage[],) => {
    calls.push(messages.map((message,) => ({ ...message, })),);
    const content = responses[index++] ?? null;
    if (content === null) { return null; }
    return { content, model: "stub-model", provider: "stub", latencyMs: 0, promptTokens: 0, completionTokens: 0, };
  }) as MinimaxFormatDeps["call"];

  const deps = { call, config: {} as MinimaxFormatDeps["config"], db: {} as MinimaxFormatDeps["db"], };
  return { deps, calls, };
}

describe("formatMinimaxPrompt (injected caller)", () => {
  it("returns aux_unavailable when the caller cannot answer", async () => {
    const { deps, calls, } = withCaller([null,],);
    expect(await formatMinimaxPrompt(INPUT, deps,),).toEqual({ ok: false, reason: "aux_unavailable", },);
    expect(calls.length,).toBe(1,);
  });

  it("returns empty_input without calling the aux", async () => {
    const { deps, calls, } = withCaller([CONFORMING,],);
    expect(await formatMinimaxPrompt({ mode: "fl2va", details: "   ", }, deps,),).toEqual({
      ok: false,
      reason: "empty_input",
    },);

    expect(calls.length,).toBe(0,);
  });

  it("accepts a conforming first draft in one call", async () => {
    const { deps, calls, } = withCaller([CONFORMING,],);
    expect(await formatMinimaxPrompt(INPUT, deps,),).toEqual({ ok: true, prompt: CONFORMING, },);
    expect(calls.length,).toBe(1,);
    expect(calls[0]?.map((message,) => message.role) ?? [],).toEqual(["system", "user",],);
  });

  it("re-prompts once with missing checks and accepts the fix", async () => {
    const { deps, calls, } = withCaller([UNALIGNED, ALIGNED,],);
    const input: MinimaxFormatInput = { ...INPUT, references: ["<Picture 1>", "<Picture 2>",], };
    expect(await formatMinimaxPrompt(input, deps,),).toEqual({ ok: true, prompt: ALIGNED, },);
    expect(calls.length,).toBe(2,);
    const retry = calls[1] ?? [];
    expect(retry.map((message,) => message.role),).toEqual(["system", "user", "assistant", "user",],);
    expect(retry[3]?.content,).toContain("alignment_line",);
  });

  it("fails closed with format_mismatch after one retry", async () => {
    const { deps, calls, } = withCaller([UNALIGNED, "still plain prose",],);
    const result = await formatMinimaxPrompt(INPUT, deps,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.reason,).toBe("format_mismatch",);
      expect(result.missing?.length,).toBeGreaterThan(0,);
    }

    expect(calls.length,).toBe(2,);
  });

  it("returns aux_unavailable when only the retry caller fails", async () => {
    const { deps, calls, } = withCaller([UNALIGNED, null,],);
    expect(await formatMinimaxPrompt(INPUT, deps,),).toEqual({ ok: false, reason: "aux_unavailable", },);
    expect(calls.length,).toBe(2,);
  });

  it("pins the REF2VA system prompt instructions", async () => {
    const { deps, calls, } = withCaller([REF_CONFORMING,],);
    const result = await formatMinimaxPrompt({ mode: "ref2va", details: "a yellow plane climbs", }, deps,);
    expect(result,).toEqual({ ok: true, prompt: REF_CONFORMING, },);
    const system = calls[0]?.[0]?.content ?? "";
    expect(system,).toContain("MiniMax H3 REF2VA video prompt writer",);
    for (
      const heading of [
        "subject_definitions:",
        "summary:",
        "retention_analysis:",
        "detailed_description:",
        "overall_soundscape:",
        "non_diegetic_music:",
      ]
    ) {
      expect(system,).toContain(heading,);
    }
  });
});
