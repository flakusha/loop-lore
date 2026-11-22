// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image-edit provider selection for chat commands.
 *
 * The shipped `imageOps` capability gate is the only policy input. No new
 * honkbox capability key is introduced: a probe without `imageOps` (or with no
 * `HONKBOX_BASE_URL` configured at all) leaves the ComfyUI action path alone.
 */

import {
  getHonkboxCapabilities,
  type HonkboxProbeResult,
  isHonkboxFeatureEnabled,
} from "../integrations/honkbox";
import {
  HonkboxEditProvider,
} from "./providers/honkbox-provider";
import type { ImageEditProvider, WorkflowTemplate, } from "./types";

/** @param template - the resolved image-edit template
 * @returns whether the template can be rendered by honkbox's edits route
 */
export function isHonkboxEditCompatible(template: WorkflowTemplate,): boolean {
  return template.backends.includes("comfyui",) &&
    (template.category === "img2img" || template.category === "inpaint") &&
    template.parameters.some((p,) => p.type === "image");
}

/** @param probe - cached probe outcome, if any
 * @param template - resolved image-edit template
 * @returns true only when the shipped gate and the template both allow honkbox
 */
export function shouldUseHonkbox(
  probe: HonkboxProbeResult | undefined,
  template: WorkflowTemplate,
): boolean {
  return isHonkboxFeatureEnabled(probe, "imageOps",) && isHonkboxEditCompatible(template,);
}

/** @returns the cached probe for the configured honkbox, or undefined when unconfigured
 */
export async function honkboxProbeForImgEdit(): Promise<HonkboxProbeResult | undefined> {
  const baseUrl = process.env.HONKBOX_BASE_URL;
  if (!baseUrl) { return undefined; }
  return await getHonkboxCapabilities({
    baseUrl,
    apiKey: process.env.HONKBOX_API_KEY,
  },);
}

/** @param probe - the probe used by {@link shouldUseHonkbox}
 * @returns a honkbox edit provider pointed at the configured endpoint
 */
export function createHonkboxEditProvider(
  probe: HonkboxProbeResult | undefined,
): ImageEditProvider {
  return new HonkboxEditProvider({
    baseUrl: process.env.HONKBOX_BASE_URL ?? "",
    apiKey: process.env.HONKBOX_API_KEY,
    probe,
  },);
}
