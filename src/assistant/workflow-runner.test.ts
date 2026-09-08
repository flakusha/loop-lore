// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Tests for the assistant workflow runner state machine.

import { describe, expect, test, } from "bun:test";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import {
  assemblePrompt,
  buildStep,
  confirmAndDispatch,
  confirmRun,
  previewSteps,
  startWorkflow,
} from "./workflow-runner";

const WORKFLOW: AssistantWorkflowConfig = {
  id: "video-minimax-h3",
  name: "Minimax H3 video generation",
  triggers: ["minimax video",],
  modelFamily: "minimax-h3",
  steps: [
    {
      id: "subject",
      name: "Subject",
      type: "text",
      minLength: 4,
      maxLength: 400,
      formatTemplate: "Subject: {value}",
    },
    {
      id: "motion",
      name: "Camera motion",
      type: "choice",
      options: ["static", "slow push-in",],
      recommendations: ["slow push-in",],
      formatTemplate: "Motion: {value}",
    },
    {
      id: "style",
      name: "Visual style",
      type: "multi",
      options: ["cinematic", "photorealistic",],
      formatTemplate: "Style: {value}",
    },
  ],
  dispatch: {
    backend: "generation-video",
    target: "POST /api/generation/video",
    payloadTemplate: { model: "minimax-h3", prompt: "{prompt}", },
    nsfwPolicy: "prefilter",
  },
  approval: { type: "confirm", preview: true, },
};

describe("startWorkflow", () => {
  test("returns empty unconfirmed run for the workflow id", () => {
    const run = startWorkflow(WORKFLOW,);
    expect(run.workflowId,).toBe("video-minimax-h3",);
    expect(run.values,).toEqual({},);
    expect(run.confirmed,).toBe(false,);
  });
});

describe("previewSteps", () => {
  test("exposes ordered steps with recommendations", () => {
    const preview = previewSteps(WORKFLOW,);
    expect(preview.map((s,) => s.id),).toEqual(["subject", "motion", "style",],);
    expect(preview[1]?.recommendations,).toEqual(["slow push-in",],);
    expect(preview[0]?.recommendations,).toEqual([],);
  });
});

describe("buildStep", () => {
  test("accepts valid text, choice, and multi values", () => {
    const run = startWorkflow(WORKFLOW,);
    buildStep(WORKFLOW, run, "subject", "  neon alley  ",);
    buildStep(WORKFLOW, run, "motion", "static",);
    buildStep(WORKFLOW, run, "style", ["cinematic", "photorealistic",],);
    expect(run.values.subject,).toBe("neon alley",);
    expect(run.values.style,).toEqual(["cinematic", "photorealistic",],);
  });

  test("parses comma-separated strings for multi steps", () => {
    const run = startWorkflow(WORKFLOW,);
    buildStep(WORKFLOW, run, "style", "cinematic, photorealistic",);
    expect(run.values.style,).toEqual(["cinematic", "photorealistic",],);
  });

  test("rejects unknown step ids", () => {
    const run = startWorkflow(WORKFLOW,);
    expect(() => buildStep(WORKFLOW, run, "nope", "x",)).toThrow("unknown step",);
  });

  test("rejects empty text and invalid choice options", () => {
    const run = startWorkflow(WORKFLOW,);
    expect(() => buildStep(WORKFLOW, run, "subject", "   ",)).toThrow("must not be empty",);
    expect(() => buildStep(WORKFLOW, run, "motion", "backflip",)).toThrow("invalid option",);
  });

  test("rejects text below minLength and invalid multi options", () => {
    const run = startWorkflow(WORKFLOW,);
    expect(() => buildStep(WORKFLOW, run, "subject", "abc",)).toThrow("at least 4",);
    expect(() => buildStep(WORKFLOW, run, "style", ["noir",],)).toThrow("invalid option",);
  });
});

describe("assemblePrompt + confirmAndDispatch", () => {
  test("full flow produces dispatch payload with assembled prompt", () => {
    const run = startWorkflow(WORKFLOW,);
    buildStep(WORKFLOW, run, "subject", "neon alley",);
    buildStep(WORKFLOW, run, "motion", "static",);
    buildStep(WORKFLOW, run, "style", ["cinematic",],);
    const prompt = assemblePrompt(WORKFLOW, run,);
    expect(prompt,).toBe("Subject: neon alley\nMotion: static\nStyle: cinematic",);
    expect(() => confirmAndDispatch(WORKFLOW, run, prompt,)).toThrow("requires confirmation",);
    confirmRun(run,);
    const dispatch = confirmAndDispatch(WORKFLOW, run, prompt,);
    expect(dispatch.backend,).toBe("generation-video",);
    expect(dispatch.target,).toBe("POST /api/generation/video",);
    expect(dispatch.payload,).toEqual({ model: "minimax-h3", prompt, },);
  });

  test("refuses dispatch with missing steps", () => {
    const run = startWorkflow(WORKFLOW,);
    buildStep(WORKFLOW, run, "subject", "neon alley",);
    confirmRun(run,);
    expect(() => confirmAndDispatch(WORKFLOW, run, "x",)).toThrow("missing steps: motion, style",);
  });
});
