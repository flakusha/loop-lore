// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ComfyUIWorkflow, } from "../providers/comfyui";
import { buildSubstitutionVars, } from "../workflow-substitutor";
import { getWorkflowLoader, } from "./loader";

/**
 * Convenience function: load and substitute a workflow in one call.
 *
 * @param name - Workflow name (e.g., "txt2img")
 * @param params - Generation parameters to substitute
 * @returns Ready-to-submit ComfyUI workflow
 */
export async function loadComfyUIWorkflow(
  name: string,
  params: {
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    seed?: number;
    [key: string]: unknown;
  },
): Promise<ComfyUIWorkflow> {
  const loader = getWorkflowLoader();
  const vars = buildSubstitutionVars(params,);
  return loader.loadWorkflow({ name, vars, },);
}
