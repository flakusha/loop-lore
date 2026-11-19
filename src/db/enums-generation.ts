// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — Generation
 *
 * Generation attempt status, cancellation reasons and sources,
 * and streaming chunk actions.
 */

import { createMachine, type StateDef, } from "./state";

// ── Generation Attempts ───────────────────────────────────
export const GenerationStatus = {
  Pending: "pending",
  Processing: "processing",
  Streaming: "streaming",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
/** */
export type GenerationStatus = (typeof GenerationStatus)[keyof typeof GenerationStatus];

// ── State Machine ──────────────────────────────────────────

const generationStatusDef: StateDef<GenerationStatus> = {
  values: ["pending", "processing", "streaming", "completed", "failed", "cancelled",] as const,
  initial: "pending",
  transitions: {
    pending: ["processing",],
    processing: ["streaming", "completed", "failed", "cancelled",],
    streaming: ["completed", "failed", "cancelled",],
    completed: [],
    failed: [],
    cancelled: [],
  },
  terminal: ["completed", "failed", "cancelled",],
};

export const generationStatusMachine = createMachine(generationStatusDef,);

export const CancelReason = {
  UserCancel: "user_cancel",
  RepetitionDetected: "repetition_detected",
  PolicyMismatch: "policy_mismatch",
  ResponseLimit: "response_limit",
  ChatSwitch: "chat_switch",
  Timeout: "timeout",
  Error: "error",
} as const;
/** */
export type CancelReason = (typeof CancelReason)[keyof typeof CancelReason];

export const CancelSource = {
  User: "user",
  AutoRepetition: "auto_repetition",
  AutoPolicy: "auto_policy",
  AutoLimit: "auto_limit",
  ChatSwitch: "chat_switch",
  System: "system",
} as const;
/** */
export type CancelSource = (typeof CancelSource)[keyof typeof CancelSource];

// ── Streaming Chunk Pipeline ──────────────────────────────
export const ChunkAction = {
  Continue: "continue",
  CancelRepetition: "cancel_repetition",
  CancelPolicy: "cancel_policy",
  CancelResponseLimit: "cancel_response_limit",
  Complete: "complete",
} as const;
/** */
export type ChunkAction = (typeof ChunkAction)[keyof typeof ChunkAction];

// ── Prompt Template Library (FEAT-065) ────────────────────
export const TemplateModality = {
  Llm: "llm",
  Image: "image",
  Video: "video",
  Audio: "audio",
  /** ComfyUI API-format graph; the graph lives inline in `payload`. */
  Workflow: "workflow",
} as const;
/** */
export type TemplateModality = (typeof TemplateModality)[keyof typeof TemplateModality];

/**
 * Every modality the template library accepts, in enum order.
 *
 * Derived from the enum so a new value cannot be added in one place and
 * forgotten in another. Three separate `MODALITIES` arrays used to be
 * hand-maintained here and in the route layers; a miss compiled clean and
 * only surfaced as a silent 400 at runtime.
 */
export const TEMPLATE_MODALITIES: readonly TemplateModality[] = Object.values(TemplateModality,);

export const TemplateDetailLevel = {
  Instant: "instant",
  Balanced: "balanced",
  Detailed: "detailed",
} as const;
/** */
export type TemplateDetailLevel = (typeof TemplateDetailLevel)[keyof typeof TemplateDetailLevel];

/** Acceptance-probe gate state for a `prompt_templates` workflow row. */
export const WorkflowProbeStatus = {
  Unprobed: "unprobed",
  Passing: "passing",
  Failing: "failing",
} as const;
/** */
export type WorkflowProbeStatus = (typeof WorkflowProbeStatus)[keyof typeof WorkflowProbeStatus];

// ── IVSS scenario / fragment manifest ───────────────────────
export const ScenarioStatus = {
  Draft: "draft",
  Active: "active",
  Archived: "archived",
} as const;
/** */
export type ScenarioStatus = (typeof ScenarioStatus)[keyof typeof ScenarioStatus];

export const SceneMode = {
  TextToVideo: "t2v",
  ImageToVideoFirst: "i2v_ff",
  ImageToVideoFirstLast: "i2v_flf",
  VideoToVideoEdit: "v2v_edit",
  Continuation: "continuation",
  Image: "image",
} as const;
/** */
export type SceneMode = (typeof SceneMode)[keyof typeof SceneMode];

export const SceneStatus = {
  Planned: "planned",
  Rendering: "rendering",
  Ready: "ready",
  Failed: "failed",
} as const;
/** */
export type SceneStatus = (typeof SceneStatus)[keyof typeof SceneStatus];

export const CutType = {
  HardCut: "hard_cut",
  Crossfade: "crossfade",
  Interpolated: "interpolated",
} as const;
/** */
export type CutType = (typeof CutType)[keyof typeof CutType];

export const FragmentOperation = {
  Render: "render",
  Rerender: "rerender",
  Prompt: "prompt",
  LatentSave: "latent_save",
  LatentLoad: "latent_load",
  Stitch: "stitch",
  AudioFallback: "audio_fallback",
  Postprocess: "postprocess",
  Custom: "custom",
} as const;
/** */
export type FragmentOperation = (typeof FragmentOperation)[keyof typeof FragmentOperation];

export const FragmentStatus = {
  Planned: "planned",
  Queued: "queued",
  Running: "running",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
  Invalidated: "invalidated",
} as const;
/** */
export type FragmentStatus = (typeof FragmentStatus)[keyof typeof FragmentStatus];

// ── IVSS references, docs and annotations ──────────────────
export const ReferenceScope = {
  Scenario: "scenario",
  Scene: "scene",
  Shot: "shot",
} as const;
/** */
export type ReferenceScope = (typeof ReferenceScope)[keyof typeof ReferenceScope];

export const ReferenceLane = {
  Image: "image",
  Video: "video",
  Audio: "audio",
} as const;
/** */
export type ReferenceLane = (typeof ReferenceLane)[keyof typeof ReferenceLane];

export const ScenarioDocKind = {
  Scenario: "scenario",
  Plot: "plot",
  Synopsis: "synopsis",
  Soundscape: "soundscape",
  Music: "music",
} as const;
/** */
export type ScenarioDocKind = (typeof ScenarioDocKind)[keyof typeof ScenarioDocKind];

export const AnnotationTargetType = {
  Scenario: "scenario",
  Scene: "scene",
  Shot: "shot",
  Fragment: "fragment",
  Asset: "asset",
} as const;
/** */
export type AnnotationTargetType = (typeof AnnotationTargetType)[keyof typeof AnnotationTargetType];
