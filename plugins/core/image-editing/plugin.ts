// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Image Editing Plugin — Core plugin for ComfyUI + sd-server image editing
 *
 * Loads the built-in and operator-configured workflow templates. Both ComfyUI
 * and sd-server are first-class citizen backends.
 *
 * This plugin does **not** register API routes. They are served by the v1
 * content barrel (`src/routes/v1/content-surface.ts`), which mounts
 * `imageEditRoutes` at `/api/v1/image-edit/*`. Registering them here as well
 * served a second, un-versioned `/api/image-edit/*` copy via
 * `dispatchPluginRoute` — which `src/server/handler.ts` runs *before* the
 * Elysia app — and no client consumed it.
 *
 * License: Apache-2.0 OR MIT
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { templateRegistry, registerConfigWorkflows } from "../../../src/image-edit/template-registry";
import { builtinTemplates } from "../../../src/image-edit/templates/builtin";
import { loadTemplateConfig } from "../../../src/config/templates-loader";

export const plugin: PluginManifest = {
  name: "image-editing",
  version: "1.0.0",
  description:
    "Unified image editing via ComfyUI and sd-server backends — txt2img, img2img, inpaint, upscale, ControlNet",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    // Register built-in templates
    for (const template of builtinTemplates) {
      templateRegistry.register(template);
    }

    // Register config-defined workflows
    const templateConfig = loadTemplateConfig();
    registerConfigWorkflows(templateConfig.imageEdit);

    const configCount = Object.keys(templateConfig.imageEdit.workflows).length;
    context.logger.info(
      `Loaded ${builtinTemplates.length + configCount} image editing templates (${builtinTemplates.length} built-in, ${configCount} config)`,
    );
  },

  async onUnload() {
    templateRegistry.clear();
  },
};
