import type { ImageProviderConfig, } from "../../config/schema";
import { validateProviderUrl, } from "../../utils/url-validation";
import { ComfyUIClient, } from "../providers/comfyui";
import { loadComfyUIWorkflow, } from "../workflow-loader";
import { failure, ok, } from "./helpers";
import type { ImageGenOptions, ImageGenOutcome, } from "./types";

/** Generate images via a ComfyUI workflow (loaded + substituted from disk). */
export async function generateComfyUI(
  sdConfig: ImageProviderConfig,
  opts: ImageGenOptions,
): Promise<ImageGenOutcome> {
  const workflowName = opts.workflow ?? "txt2img";
  const validatedComfy = validateProviderUrl(sdConfig.baseUrl,);
  if (!validatedComfy.ok) {
    return failure(`Invalid ComfyUI URL: ${validatedComfy.error}`, 400,);
  }

  const workflow = await loadComfyUIWorkflow(workflowName, {
    prompt: opts.prompt,
    negativePrompt: opts.negativePrompt,
    width: sdConfig.defaults.width,
    height: sdConfig.defaults.height,
    steps: opts.steps ?? sdConfig.defaults.steps,
    cfgScale: opts.cfgScale ?? sdConfig.defaults.cfgScale,
    sampler: opts.samplerName ?? sdConfig.defaults.sampler,
    seed: opts.seed,
  },);

  const comfyClient = new ComfyUIClient({
    baseUrl: sdConfig.baseUrl,
    timeout: sdConfig.generationTimeout ?? 120_000,
  },);

  const buffers = await comfyClient.runWorkflow(workflow,);
  return ok(buffers, "image/png",);
}
