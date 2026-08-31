// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Built-in Workflow Templates — txt2img, img2img, inpaint, upscale, controlnet
 *
 * Each template produces a ComfyUI workflow JSON structure.
 * sd-server templates use the same parameters but are translated
 * at the provider layer to the appropriate API call.
 */
import type { WorkflowTemplate, } from "../../types";
import { controlnet, } from "./controlnet";
import { img2img, } from "./img2img";
import { inpaint, } from "./inpaint";
import { txt2img, } from "./txt2img";
import { upscale, } from "./upscale";

// ── Export all built-in templates ────────────────────────────

export const builtinTemplates: WorkflowTemplate[] = [
  txt2img,
  img2img,
  inpaint,
  upscale,
  controlnet,
];
