// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/workflow-loader/convenience.ts -- the
 * loadComfyUIWorkflow one-shot helper, exercised against the bundled
 * configs/workflows templates (tests run from the repo root).
 */
import { beforeAll, beforeEach, describe, expect, it, } from "bun:test";
import { createLogger, } from "../../logger";
import { resetWorkflowLoaderForTests, } from "./index.js";
import { loadComfyUIWorkflow, } from "./convenience";

describe("loadComfyUIWorkflow", () => {
  beforeAll(() => {
    createLogger({ level: "error", },);
  },);

  beforeEach(() => {
    // Reset the singleton so getWorkflowLoader() re-binds to the default
    // process.cwd()/configs/workflows fresh each test, isolating us from
    // whichever directory loader.test.ts bound in a shared-process run.
    resetWorkflowLoaderForTests();
  },);

  it("loads the bundled txt2img workflow and substitutes the prompt", async () => {
    const workflow = await loadComfyUIWorkflow("txt2img", {
      prompt: "a tiny castle at dusk",
      negativePrompt: "blurry",
      width: 128,
      height: 128,
      steps: 2,
      cfgScale: 4,
      sampler: "euler",
      seed: 42,
    },);

    const serialized = JSON.stringify(workflow,);
    expect(serialized,).toContain("a tiny castle at dusk",);
    expect(serialized,).not.toContain("{{prompt}}",);
  },);

  it("applies default params when optional fields are omitted", async () => {
    const workflow = await loadComfyUIWorkflow("txt2img", {
      prompt: "prompt-only",
    },);
    expect(JSON.stringify(workflow,),).toContain("prompt-only",);
  },);

  it("rejects with a helpful error for unknown workflow names", async () => {
    await expect(loadComfyUIWorkflow("no-such-workflow", { prompt: "x", },),)
      .rejects.toThrow(/no-such-workflow/);
  },);
},);
