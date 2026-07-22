/**
 * Image Editing Types — Unified interface for ComfyUI and sd-server
 *
 * Both backends support text-to-image, img2img, inpainting, upscaling,
 * and ControlNet workflows. This module defines the common types
 * shared across both providers.
 *
 * @module image-edit-types
 */

import type { ComfyUIWorkflow, } from "../generation/providers/comfyui";

// ── Template System ──────────────────────────────────────────

/** Supported image editing operation categories */
export type ImageEditCategory =
  | "txt2img"
  | "img2img"
  | "inpaint"
  | "upscale"
  | "controlnet";

/** Supported backend providers */
export type ImageEditBackend = "comfyui" | "sd-server";

/** Parameter type for template UI rendering */
export type TemplateParamType =
  | "string"
  | "number"
  | "boolean"
  | "select"
  | "image";

/** A single parameter exposed in the template UI */
export interface TemplateParameter {
  name: string;
  type: TemplateParamType;
  label: string;
  description?: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: unknown }[];
  required?: boolean;
}

/**
 * Workflow template — describes an image editing operation
 * that can be rendered into backend-specific API calls.
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: ImageEditCategory;
  backends: ImageEditBackend[];
  required_nodes: string[];
  parameters: TemplateParameter[];
  build: (params: Record<string, unknown>,) => ComfyUIWorkflow;
}

// ── Provider Interface ───────────────────────────────────────

/** Result from a single image generation/edit */
export interface ImageEditResult {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  width?: number;
  height?: number;
}

/** Common request for image editing operations */
export interface ImageEditRequest {
  template_id: string;
  backend: ImageEditBackend;
  params: Record<string, unknown>;
  /** Optional chat/message linkage */
  chatId?: string;
  messageId?: string;
}

/** Progress callback for long-running operations */
export interface ImageEditProgress {
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number; // 0-1
  message?: string;
}

/** Provider that can execute image editing workflows */
export interface ImageEditProvider {
  readonly name: ImageEditBackend;

  /** Check if the backend is reachable */
  healthCheck(): Promise<boolean>;

  /** List available operations this backend supports */
  listCapabilities(): Promise<ImageEditCategory[]>;

  /** Execute an image edit operation */
  execute(
    request: ImageEditRequest,
    template: WorkflowTemplate,
    onProgress?: (progress: ImageEditProgress,) => void,
  ): Promise<ImageEditResult[]>;
}

// ── Discovery ────────────────────────────────────────────────

// Re-export ComfyUINodeInfo from generation module for convenience
export type { ComfyUINodeInfo, } from "../generation/providers/comfyui";

/** sd-server capability info */
export interface SDServerCapabilities {
  apiFamily: "openai" | "sdapi" | "sdcpp";
  features: ImageEditCategory[];
  models: { name: string; type: string }[];
}
