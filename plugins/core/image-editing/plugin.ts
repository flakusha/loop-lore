/**
 * Image Editing Plugin — Core plugin for ComfyUI + sd-server image editing
 *
 * Registers API routes and loads built-in workflow templates.
 * Both ComfyUI and sd-server are first-class citizen backends.
 *
 * License: Apache-2.0 OR MIT
 */

import type { PluginManifest } from "../../../src/plugins/types";
import {
  handleRun,
  handleTemplates,
  handleNodes,
  handleCapabilities,
  handleHealth,
} from "../../../src/image-edit/routes";
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

    const totalCount = builtinTemplates.length + Object.keys(templateConfig.imageEdit.workflows).length;
    context.logger.info(
      `Loaded ${totalCount} image editing templates (${builtinTemplates.length} built-in, ${Object.keys(templateConfig.imageEdit.workflows).length} config)`,
    );

    // Register API routes
    context.registerApiRoute({
      method: "POST",
      path: "/api/image-edit/run",
      handler: handleRun,
      description: "Execute an image editing workflow template",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/image-edit/templates",
      handler: handleTemplates,
      description: "List available workflow templates",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/image-edit/nodes",
      handler: handleNodes,
      description: "Discover installed ComfyUI nodes",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/image-edit/capabilities",
      handler: handleCapabilities,
      description: "List backend capabilities and health",
    });

    context.registerApiRoute({
      method: "GET",
      path: "/api/image-edit/health",
      handler: handleHealth,
      description: "Quick health check for all backends",
    });

    context.logger.info("Image editing routes registered");
  },

  async onUnload() {
    templateRegistry.clear();
  },
};
