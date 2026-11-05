// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Operator-authored ComfyUI edit workflows as image-edit templates.
 *
 * The graph encodes the model; the factory only wires prompt + input-image
 * substitution over an injected loader, so no real configs/workflows file and
 * no mock.module (which leaks across files in one bun process) is involved.
 */
import { describe, expect, test, } from "bun:test";
import type { ImageProviderConfig, } from "../../config/schema";
import type { ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { registerBuiltinTemplates, templateRegistry, } from "../template-registry";
import {
  createWorkflowFileTemplate,
  registerWorkflowFileTemplates,
  WORKFLOW_FILE_SOURCE,
} from "./comfyui-workflow-template";
import type { WorkflowFileLoader, } from "./comfyui-workflow-template";

/** Minimal edit graph: input image, prompt, seed, sink. */
const GRAPH: ComfyUIWorkflow = {
  "1": { class_type: "LoadImage", inputs: { image: "{{input_image}}", }, },
  "2": { class_type: "CLIPTextEncode", inputs: { text: "{{prompt}}", }, },
  "3": { class_type: "KSampler", inputs: { seed: "{{seed}}", model: ["1", 0,], }, },
  "4": { class_type: "SaveImage", inputs: { images: ["3", 0,], }, },
};

function provider(workflow?: string, purpose: "edit" | "generate" = "edit",): ImageProviderConfig {
  return {
    name: "edit-comfy",
    label: "Edit Comfy",
    baseUrl: "http://edit-comfy.invalid",
    apiFamily: "openai",
    purpose,
    ...(workflow === undefined ? {} : { workflow, }),
    defaults: { width: 64, height: 64, steps: 1, cfgScale: 1, sampler: "euler", },
    timeout: 1000,
    generationTimeout: 1000,
  };
}

function loaderReturning(graph: ComfyUIWorkflow | null,): WorkflowFileLoader {
  return async () => graph;
}

function inputsOf(graph: ComfyUIWorkflow, classType: string,): Record<string, unknown> {
  const node = Object.values(graph,).find((candidate,) => candidate.class_type === classType);
  return (node?.inputs ?? {}) as Record<string, unknown>;
}

describe("createWorkflowFileTemplate", () => {
  test("returns null when the provider names no workflow file", async () => {
    expect(await createWorkflowFileTemplate(provider(),),).toBeNull();
  });

  test("returns null when the loader has no such workflow", async () => {
    expect(await createWorkflowFileTemplate(provider("qwen-edit",), loaderReturning(null,),),).toBeNull();
  });

  test("substitutes prompt, negative prompt, input image and a numeric seed", async () => {
    const template = await createWorkflowFileTemplate(
      provider("qwen-edit",),
      loaderReturning(GRAPH,),
    );

    expect(template,).not.toBeNull();
    expect(template!.id,).toBe("workflow:edit-comfy",);
    expect(template!.backends,).toEqual(["comfyui",],);

    const graph = template!.build({
      prompt: "make it dusk",
      negative_prompt: "blurry",
      input_image: "uploaded-abc.png",
      seed: 7,
    },);

    expect(inputsOf(graph, "LoadImage",).image,).toBe("uploaded-abc.png",);
    expect(inputsOf(graph, "CLIPTextEncode",).text,).toBe("make it dusk",);
    expect(inputsOf(graph, "KSampler",).seed,).toBe(7,);
  });

  test("a -1 seed is resolved to a random number, not the sentinel", async () => {
    const template = await createWorkflowFileTemplate(provider("qwen-edit",), loaderReturning(GRAPH,),);
    const graph = template!.build({ prompt: "p", input_image: "i", seed: -1, },);
    const seed = inputsOf(graph, "KSampler",).seed as number;
    expect(Number.isInteger(seed,),).toBe(true,);
    expect(seed,).toBeGreaterThanOrEqual(0,);
  });

  test("an image-typed parameter is declared so the upload step engages", async () => {
    const template = await createWorkflowFileTemplate(provider("qwen-edit",), loaderReturning(GRAPH,),);
    const imageParams = template!.parameters.filter((parameter,) => parameter.type === "image");
    expect(imageParams.map((parameter,) => parameter.name),).toEqual(["input_image",],);
  });
});

describe("registerWorkflowFileTemplates", () => {
  test("registers one template per edit-purpose provider naming a workflow", async () => {
    const cfg = {
      generation: { providers: { sd: [provider("qwen-edit",), provider(undefined, "generate",),], }, },
    } as Parameters<typeof registerWorkflowFileTemplates>[0];

    await registerWorkflowFileTemplates(cfg, loaderReturning(GRAPH,),);

    const registered = templateRegistry.get("workflow:edit-comfy",);
    expect(registered,).toBeDefined();
    expect(registered!.category,).toBe("img2img",);
  });

  test("a provider named like a built-in never clobbers the built-in template", async () => {
    const cfg = {
      generation: { providers: { sd: [{ ...provider("qwen-edit",), name: "img2img", },], }, },
    } as Parameters<typeof registerWorkflowFileTemplates>[0];

    registerBuiltinTemplates();
    const builtin = templateRegistry.get("img2img",);
    expect(builtin,).toBeDefined();

    await registerWorkflowFileTemplates(cfg, loaderReturning(GRAPH,),);

    expect(templateRegistry.get("img2img",),).toBe(builtin,);
    expect(templateRegistry.get("workflow:img2img",),).toBeDefined();
  });

  test("a provider that drops its workflow loses its template on the next pass", async () => {
    const withWorkflow = {
      generation: { providers: { sd: [provider("qwen-edit",),], }, },
    } as Parameters<typeof registerWorkflowFileTemplates>[0];

    const withoutWorkflow = {
      generation: { providers: { sd: [provider(),], }, },
    } as Parameters<typeof registerWorkflowFileTemplates>[0];

    await registerWorkflowFileTemplates(withWorkflow, loaderReturning(GRAPH,),);
    expect(templateRegistry.get("workflow:edit-comfy",),).toBeDefined();

    await registerWorkflowFileTemplates(withoutWorkflow, loaderReturning(GRAPH,),);
    expect(templateRegistry.get("workflow:edit-comfy",),).toBeUndefined();
    expect(templateRegistry.listAll().some((t,) => t.id === WORKFLOW_FILE_SOURCE),).toBe(false,);
  });
});
