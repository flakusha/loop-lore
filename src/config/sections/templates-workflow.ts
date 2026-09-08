// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/templates-workflow.ts — assistant workflow template
// types (split from templates.ts; re-exported there so existing
// ../sections/templates import paths keep working).

import type { MergeStrategy, } from "./templates";

// ── Assistant Workflow Templates (epic-assistant-creative-studio-workflows) ──

/** Single prompt-construction step inside a workflow template */
export interface WorkflowStepConfig {
  id: string;
  name: string;
  /** Step kind: free text, single choice, or multi choice */
  type: "text" | "choice" | "multi";
  description?: string;
  /** Suggested values / recommendations shown in preview */
  recommendations?: string[];
  /** Choice options (required when type is choice/multi) */
  options?: string[];
  /** Minimum/maximum length for text steps */
  minLength?: number;
  maxLength?: number;
  /** Handlebars-style template; `{value}` is the validated step input */
  formatTemplate: string;
}

/** Dispatch target for a confirmed workflow */
export interface WorkflowDispatchConfig {
  backend: string;
  /** API endpoint or pipeline target, e.g. POST /api/generation/video */
  target: string;
  /** Payload template; `{prompt}` is the assembled prompt */
  payloadTemplate: Record<string, unknown>;
  nsfwPolicy?: "prefilter" | "consent-gate" | "none";
}

/** Approval gate for a workflow */
export interface WorkflowApprovalConfig {
  type: "confirm" | "auto";
  preview?: boolean;
}

/** Config-driven assistant workflow template (multi-step generation scenario) */
export interface AssistantWorkflowConfig {
  id: string;
  name: string;
  description?: string;
  /** Intent trigger phrases matched against user messages */
  triggers?: string[];
  /** Model family preset key from model-families.yaml */
  modelFamily?: string;
  steps: WorkflowStepConfig[];
  dispatch: WorkflowDispatchConfig;
  approval?: WorkflowApprovalConfig;
}

/** Assistant workflow template configuration (multi-file: workflows/*.yaml) */
export interface WorkflowTemplateConfig {
  merge: MergeStrategy;
  workflows: Record<string, AssistantWorkflowConfig>;
}
