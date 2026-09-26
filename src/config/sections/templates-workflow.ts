// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/templates-workflow.ts — assistant workflow template
// types (split from templates.ts; re-exported there so existing
// ../sections/templates import paths keep working).

import type { AssistantIntent, } from "../../regex/intent";
import type { MergeStrategy, } from "./templates";

// ── Assistant Workflow Templates (epic-assistant-creative-studio-workflows) ──

/** Intent metadata routing a message to this workflow (epic §7.4). */
export interface WorkflowIntentConfig {
  /** `AssistantIntent` taxonomy value this workflow serves. */
  type: AssistantIntent;
  /** Target key matched against `INTENT_PATTERNS[].target`. */
  target: string;
}

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
  /**
   * Whether the step must be filled before dispatch. Defaults to `true`;
   * an entity-type preset may list only a subset in `requiredSteps`.
   */
  required?: boolean;
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
  /** Intent metadata for `INTENT_PATTERNS`-based routing (epic §7.4). */
  intent?: WorkflowIntentConfig;
  /**
   * Entity kind this workflow creates, keyed into
   * {@link WorkflowTemplateConfig.entityTypes}. Absent for media workflows.
   */
  entityType?: string;
  /** Model family preset key from model-families.yaml */
  modelFamily?: string;
  steps: WorkflowStepConfig[];
  dispatch: WorkflowDispatchConfig;
  approval?: WorkflowApprovalConfig;
}

/** Quality gates the entity pipeline runs before persistence (epic §7.6d). */
export const ENTITY_QUALITY_GATES = ["schema", "consistency", "duplicate",] as const;

/** One of the supported entity quality gate names. */
export type EntityQualityGate = (typeof ENTITY_QUALITY_GATES)[number];

/**
 * Per-entity-type preset (epic §7.6c): the step contract a guided entity
 * workflow must satisfy, the gates that run before persistence, and the
 * `/create` token a confirmed run dispatches to.
 */
export interface EntityTypePreset {
  /** Workflow id that implements this entity kind. */
  workflowId: string;
  /** Step ids that must be filled before the workflow can dispatch. */
  requiredSteps: string[];
  /** Gates run before persistence; must be a subset of ENTITY_QUALITY_GATES. */
  qualityGates: EntityQualityGate[];
  /** `/create` token a confirmed run dispatches to (e.g. `char`, `npc`). */
  dispatchTarget: string;
}

/** Assistant workflow template configuration (multi-file: workflows/*.yaml) */
export interface WorkflowTemplateConfig {
  merge: MergeStrategy;
  workflows: Record<string, AssistantWorkflowConfig>;
  /** Entity-type presets keyed by entity kind (workflows/entity-types.yaml). */
  entityTypes: Record<string, EntityTypePreset>;
}
