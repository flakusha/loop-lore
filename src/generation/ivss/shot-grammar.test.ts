// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import type { ImageEditCategory, TemplateParameter, } from "../../image-edit/types";
import type { WorkflowPayload, } from "../template-types";
import { buildWorkflowGraph, } from "../workflow-library/row";
import { compileShotGrammar, formatShotTimestamp, type ShotGrammarInput, } from "./shot-grammar";

function fixture(): ShotGrammarInput {
  return {
    scene: { id: "scene-1", mode: "t2v", fps: 24, seed: "9007199254740993", },
    shots: [
      { id: "shot-c", sort_order: 0, start_ms: 6500, end_ms: 9000, description: "Third beat", },
      { id: "shot-a", sort_order: 0, start_ms: 0, end_ms: 3000, description: "Opening beat", narration: "Voice over", },
      { id: "shot-b", sort_order: 0, start_ms: 3000, end_ms: 6500, description: "Middle beat", },
    ],
    style: "Semi-realistic anime illustration.",
    soundscape: "Wind through the alley.",
    music: "Low drone.",
  };
}

describe("IVSS shot grammar", () => {
  test("formats absolute millisecond timestamps", () => {
    expect(formatShotTimestamp(0,),).toBe("00:00.000",);
    expect(formatShotTimestamp(3000,),).toBe("00:03.000",);
    expect(formatShotTimestamp(65_432,),).toBe("01:05.432",);
    expect(formatShotTimestamp(-5,),).toBe("00:00.000",);
  });

  test("output is byte-stable and sorted regardless of row order", () => {
    const input = fixture();
    const first = compileShotGrammar(input,);
    const reversed = compileShotGrammar({ ...input, shots: [...input.shots,].reverse(), },);

    expect(reversed.prompt,).toBe(first.prompt,);
    expect(first.prompt,).toContain("[Shot 1] At 00:00.000 — Opening beat",);
    expect(first.prompt,).toContain("[Shot 2] At 00:03.000 — Middle beat",);
    expect(first.prompt,).toContain("[Shot 3] At 00:06.500 — Third beat",);
    expect(first.prompt,).toContain("Narration: Voice over",);
    expect(first.variables.duration_frames,).toBe(216,);
    expect(first.variables.seed,).toBe("9007199254740993",);
  });

  test("emits workflow variables that survive the shipped substitution path", () => {
    const compiled = compileShotGrammar(fixture(),);
    const parameters: TemplateParameter[] = [
      "prompt",
      "timeline_data",
      "builder_state",
      "seed",
    ].map((name,) => ({ name, type: "string", label: name, default: "", }));

    const payload: WorkflowPayload = {
      body: {
        "1": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", }, },
        "2": {
          class_type: "MiniMaxH3Director",
          inputs: {
            timeline_data: "{{timeline_data}}",
            builder_state: "{{builder_state}}",
            seed: "{{seed}}",
          },
        },
      },
      category: "txt2img" as ImageEditCategory,
      parameters,
      requiredNodes: [],
    };

    const graph = buildWorkflowGraph(payload, { ...compiled.variables, },);
    const serialized = JSON.stringify(graph,);

    expect(serialized,).not.toContain("{{",);
    expect(graph,).toEqual(
      expect.objectContaining({
        "1": expect.objectContaining({
          inputs: expect.objectContaining({ text: compiled.prompt, },),
        },),
      },),
    );

    expect(serialized,).toContain("9007199254740993",);

    const builder = JSON.parse(compiled.variables.builder_state,) as {
      ref: { detailed_description: string; soundscape: string; music: string };
    };

    const timeline = JSON.parse(compiled.variables.timeline_data,) as { items: unknown[] };
    expect(builder.ref.detailed_description,).toBe(compiled.prompt,);
    expect(builder.ref.soundscape,).toBe("Wind through the alley.",);
    expect(builder.ref.music,).toBe("Low drone.",);
    expect(timeline.items,).toHaveLength(3,);
  });

  test("over-budget assembly reports the documented drop order", () => {
    const compiled = compileShotGrammar(fixture(), { maxTokens: 12, },);
    expect(compiled.truncated.indexOf("style",),).toBeLessThan(compiled.truncated.indexOf("music",),);
    expect(compiled.truncated.indexOf("music",),).toBeLessThan(
      compiled.truncated.indexOf("soundscape",),
    );

    expect(compiled.truncated.some((entry,) => entry.startsWith("shots:",)),).toBe(true,);
    expect(compiled.prompt,).toContain("[Shot 1]",);
    expect(compiled.prompt,).not.toContain("overall_soundscape:",);
  });

  test("rejects empty scenes and invalid shot windows", () => {
    const input = fixture();
    expect(() => compileShotGrammar({ ...input, shots: [], },)).toThrow("no shots",);
    expect(() =>
      compileShotGrammar({
        ...input,
        shots: [{ ...input.shots[0]!, start_ms: 100, end_ms: 0, },],
      },)
    ).toThrow("ends before it starts",);
  });
});
