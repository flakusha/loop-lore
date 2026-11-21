// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure validator + workflow-mode mapper for MiniMax FL/REF prompt format.
 * No I/O and no stubs: shipped literal shapes and their malformed variants.
 */
import { describe, expect, it, } from "bun:test";
import {
  minimaxModeForWorkflow,
  validateMinimaxPrompt,
} from "./prompt-format";

const FL2VA_LITERAL =
  `integrated_multimodal_description: [Shot 1] Cinematic, a wide-angle shot frames a cyclist. The camera pushes in slowly. [Shot 2] At 00:02.100, the camera cuts to a medium shot. [Shot 3] At 00:03.600, the camera cuts to a wide tracking shot.

overall_soundscape: Distant traffic and a rhythmic series of heavy footsteps.

non_diegetic_music: Electronic bass music at a fast tempo.`;

const REF2VA_LITERAL = `subject_definitions:
<Subject 1> is the plane in <Picture 1>: a yellow propeller plane climbing vertically.
<Subject 2> is the setting in <Picture 1>: a towering cumulus cloud.
summary:
[reference generation] A five-second cinematic aviation film.
retention_analysis:
<Subject 1> (appears in [Shot 1], [Shot 2]): fully_preserved - the yellow plane is retained.
<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved - the dark sky is retained.
detailed_description:
[Shot 1] A wide shot matches <Picture 1>: <Subject 1> climbs straight up.
[Shot 2] At 00:02.000, the shot cuts to a close-up of the propeller.
overall_soundscape:
Straining engine, wind, a sudden silence at the stall.
non_diegetic_music:
Tense rising strings.`;

const ALIGNED_FL2VA =
  `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 3) aligns with the 5.00-second mark of the target video.

integrated_multimodal_description: [Shot 1] A cyclist begins in the pose of Picture 1. [Shot 2] At 00:02.000, the umbrella opens. [Shot 3] At 00:05.000, the cyclist settles into Picture 2.

overall_soundscape: Rain on pavement and a metallic click.

non_diegetic_music: N/A`;

describe("validateMinimaxPrompt", () => {
  it("rejects an unaligned FL2VA literal: the alignment line is mandatory", () => {
    expect(validateMinimaxPrompt(FL2VA_LITERAL, "fl2va",).missing,).toContain("alignment_line",);
  });

  it("accepts the shipped REF2VA literal shape with reference labels", () => {
    expect(validateMinimaxPrompt(REF2VA_LITERAL, "ref2va", { references: ["<Subject 1>",], },),).toEqual({
      ok: true,
      missing: [],
    },);
  });

  it("accepts the FL2VA alignment line with endpoint references", () => {
    const result = validateMinimaxPrompt(ALIGNED_FL2VA, "fl2va", {
      references: ["<Picture 1>", "<Picture 2>",],
    },);

    expect(result.ok,).toBe(true,);
  });

  it("accepts an alignment line even when no references were supplied", () => {
    expect(validateMinimaxPrompt(ALIGNED_FL2VA, "fl2va",).ok,).toBe(true,);
  });

  it("requires the alignment line for every FL2VA candidate", () => {
    const result = validateMinimaxPrompt(FL2VA_LITERAL, "fl2va",);
    expect(result.ok,).toBe(false,);
    expect(result.missing,).toContain("alignment_line",);
  });

  it("rejects plain prose", () => {
    const result = validateMinimaxPrompt("A red car drives down a rainy street at night.", "fl2va",);
    expect(result.ok,).toBe(false,);
    expect(result.missing,).toEqual(
      expect.arrayContaining([
        "integrated_multimodal_description:",
        "overall_soundscape:",
        "non_diegetic_music:",
        "wrapper_text",
        "shot_1",
      ],),
    );
  });

  it("rejects a missing heading", () => {
    const text = FL2VA_LITERAL.replace(/\n\nnon_diegetic_music:[\s\S]*$/, "",);
    expect(validateMinimaxPrompt(text, "fl2va",).missing,).toContain("non_diegetic_music:",);
  });

  it("rejects a timestamp on the first shot", () => {
    const text = FL2VA_LITERAL.replace("[Shot 1]", "[Shot 1] At 00:00.500",);
    expect(validateMinimaxPrompt(text, "fl2va",).missing,).toContain("shot_1_timestamp",);
  });

  it("rejects non-increasing cut times", () => {
    const text = FL2VA_LITERAL.replace("At 00:03.600", "At 00:01.000",);
    expect(validateMinimaxPrompt(text, "fl2va",).missing,).toContain("shot_order",);
  });

  it("rejects code fences", () => {
    const fence = "`".repeat(3,);
    const result = validateMinimaxPrompt(`${fence}text\n${FL2VA_LITERAL}\n${fence}`, "fl2va",);
    expect(result.missing,).toContain("no_code_fences",);
  });

  it("rejects residual placeholders", () => {
    const text = FL2VA_LITERAL.replace("Cinematic", "{{prompt}} Cinematic",);
    expect(validateMinimaxPrompt(text, "fl2va",).missing,).toContain("no_placeholders",);
  });

  it("rejects wrapper text before the first heading", () => {
    const result = validateMinimaxPrompt(`Sure, here is your prompt:\n${FL2VA_LITERAL}`, "fl2va",);
    expect(result.missing,).toContain("wrapper_text",);
  });

  it("requires all six REF2VA headings", () => {
    const text = REF2VA_LITERAL.replace("retention_analysis:\n", "",);
    expect(validateMinimaxPrompt(text, "ref2va",).missing,).toContain("retention_analysis:",);
  });
});

describe("minimaxModeForWorkflow", () => {
  it("maps FL and fragment ids to fl2va", () => {
    for (
      const id of [
        "minimax-h3-video-fl2va-v1",
        "minimax-h3-video-fl2va-opt-v1",
        "minimax-h3-video-i2v-fragment-v1",
        "minimax-h3-video-t2v-fragment-v1",
      ]
    ) {
      expect(minimaxModeForWorkflow(id,),).toBe("fl2va",);
    }
  });

  it("maps REF2VA ids to ref2va", () => {
    for (
      const id of [
        "minimax-h3-video-ref2va-v1",
        "minimax-h3-video-ref2va-opt-v1",
        "minimax-h3-video-ref2va-fragment-v1",
        "minimax-h3-ref2va-fragment-v1",
      ]
    ) {
      expect(minimaxModeForWorkflow(id,),).toBe("ref2va",);
    }
  });

  it("leaves other workflows alone", () => {
    for (const id of [undefined, "sdxl-v1", "txt2video", "minimax-h3-image-t2i-v1",]) {
      expect(minimaxModeForWorkflow(id,),).toBeNull();
    }
  });
});
