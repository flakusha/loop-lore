// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Operator-authored ComfyUI edit workflows as image-edit templates.
 *
 * An edit-purpose SD provider instance may name a workflow file under
 * `configs/workflows/` (`ImageProviderConfig.workflow`). The file's graph
 * encodes the model — Qwen-Image-Edit or any operator-authored edit
 * checkpoint; this module never hardcodes one. The run substitutes only the
 * prompt and input-image nodes (plus negative prompt and seed), using the
 * same `{{variable}}` substitution as the video/audio engines.
 *
 * The loader is an injectable seam: tests hand a stub instead of hitting the
 * real `configs/workflows/` directory (bun `mock.module` leaks across files
 * in one bun process — never use it here).
 *
 * @module comfyui-workflow-template
 */
import { loadConfig, } from "../../config/load";
import type { ImageProviderConfig, } from "../../config/schema";
import { listSdProviders, } from "../../config/schema";
import type { ComfyUIWorkflow, } from "../../generation/providers/comfyui";
import { getWorkflowLoader, } from "../../generation/workflow-loader";
import { substituteWorkflow, type SubstitutionVars, } from "../../generation/workflow-substitutor";
import { templateRegistry, } from "../template-registry";
import { resolveSeed, } from "../templates/builtin/_helpers";
import type { WorkflowTemplate, } from "../types";

/** Loads a raw (unsubstituted) workflow graph by file name; null when absent. */
export type WorkflowFileLoader = (name: string,) => Promise<ComfyUIWorkflow | null>;

/** Default seam: the shared workflow loader's raw, validated graphs. */
const defaultLoader: WorkflowFileLoader = (name,) => getWorkflowLoader().getRawWorkflow(name,);

/** Edit-run substitution keys an operator workflow may reference. */

/** Registry ownership tag for config-declared workflow-file templates. */
export const WORKFLOW_FILE_SOURCE = "workflow-file";

let registered = false;

/**
 * Build a {@link WorkflowTemplate} from one provider's workflow file.
 * @param provider - edit-purpose provider instance naming the workflow
 * @param loadWorkflow - injectable graph loader (default: shared loader)
 * @returns the registered-shape template, or null when the provider names no
 *   workflow or the file is missing/invalid (the shared loader already warns)
 */
export async function createWorkflowFileTemplate(
  provider: ImageProviderConfig,
  loadWorkflow: WorkflowFileLoader = defaultLoader,
): Promise<WorkflowTemplate | null> {
  if (!provider.workflow) { return null; }

  const workflow = await loadWorkflow(provider.workflow,);
  if (!workflow) { return null; }

  return {
    id: provider.name,
    name: provider.label || provider.name,
    description: `Operator workflow "${provider.workflow}" from configs/workflows/ ` +
      `(backend ${provider.name}),`,
    category: "img2img",
    backends: ["comfyui",],
    // The operator's graph encodes the model; nothing to gate on up front.
    required_nodes: [],
    parameters: [
      { name: "prompt", type: "string", label: "Prompt", default: "", required: true, },
      { name: "negative_prompt", type: "string", label: "Negative Prompt", default: "", },
      { name: "input_image", type: "image", label: "Input Image", required: true, default: "", },
      { name: "seed", type: "number", label: "Seed", default: -1, },
    ],
    build: (params,) => {
      const vars: SubstitutionVars = {
        prompt: (params.prompt as string) ?? "",
        negative_prompt: (params.negative_prompt as string) ?? "",
        input_image: (params.input_image as string) ?? "",
        seed: resolveSeed(params.seed,),
      };

      return substituteWorkflow(workflow, vars,) as ComfyUIWorkflow;
    },
  };
}

/**
 * Register every edit-purpose provider's workflow file as a template.
 *
 * Full-slice replacement: an operator removing the `workflow` field from a
 * config drops the template on the next pass instead of lingering.
 * @param config - loaded application config
 * @param loadWorkflow - injectable graph loader (default: shared loader)
 */
export async function registerWorkflowFileTemplates(
  config: ReturnType<typeof loadConfig>,
  loadWorkflow?: WorkflowFileLoader,
): Promise<void> {
  const candidates = listSdProviders(config.generation.providers.sd, "edit",)
    .filter((provider,) => typeof provider.workflow === "string");

  const templates: WorkflowTemplate[] = [];
  for (const provider of candidates) {
    const template = await createWorkflowFileTemplate(provider, loadWorkflow,);
    if (template) { templates.push(template,); }
  }

  templateRegistry.replaceManaged(WORKFLOW_FILE_SOURCE, templates,);
}

/**
 * Register workflow-file templates once per process (memoized).
 * Config errors (no config file) leave built-in templates available.
 */
export async function ensureWorkflowFileTemplates(): Promise<void> {
  if (registered) { return; }

  try {
    await registerWorkflowFileTemplates(loadConfig(),);
    registered = true;
  } catch {
    // config absent or malformed — built-in templates remain available
  }
}

/** Test-only: force the next {@link ensureWorkflowFileTemplates} to re-register. */
export function resetWorkflowFileTemplatesForTests(): void {
  registered = false;
}
