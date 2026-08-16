// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow Tag Model — Image/Video generation routing
 *
 * Local inference (ComfyUI / sd.cpp / llama-swap) selects a workflow
 * by a tag composition rather than a single config binding. A workflow
 * is addressed by what it produces: a `kind` (character, item,
 * monster, location) and a `modality` (image, video). The same
 * workflow may serve multiple tags; the tag set is the lookup key.
 *
 * See docs/spec/integrations/image-generation.md + docs/spec/integrations/llm-serving.md (Epic 18).
 */

/** What the generated asset represents. */
export const WorkflowKind = {
  Character: "character",
  Item: "item",
  Monster: "monster",
  Location: "location",
} as const;
export type WorkflowKind = (typeof WorkflowKind)[keyof typeof WorkflowKind];

/** Output modality the workflow produces. */
export const WorkflowModality = {
  Image: "image",
  Video: "video",
} as const;
export type WorkflowModality = (typeof WorkflowModality)[keyof typeof WorkflowModality];

/** A single workflow-addressing tag. */
export interface WorkflowTag {
  kind: WorkflowKind;
  modality: WorkflowModality;
}

const TAG_RE = /^(?<kind>character|item|monster|location):(?<modality>image|video)$/;

/**
 * Compose workflow tags into their canonical string form.
 *
 * @param tags - tags to encode
 * @returns strings like `"character:image"`, `"location:video"`
 */
export function composeWorkflowTags(tags: readonly WorkflowTag[],): string[] {
  return Array.from(tags, (t,) => `${t.kind}:${t.modality}`,);
}

/**
 * Parse a single tag string back into a {@link WorkflowTag}.
 *
 * @param tag - string like `"item:image"`
 * @returns the parsed tag, or `null` if malformed
 */
export function parseWorkflowTag(tag: string,): WorkflowTag | null {
  const match = TAG_RE.exec(tag.trim().toLowerCase(),);
  if (!match?.groups) { return null; }
  return {
    kind: match.groups.kind as WorkflowKind,
    modality: match.groups.modality as WorkflowModality,
  };
}

/**
 * Parse a set of tag strings, dropping any malformed entries.
 *
 * @param tags - raw tag strings
 * @returns validated tags (empty-safe)
 */
export function parseWorkflowTags(tags: readonly string[],): WorkflowTag[] {
  const out: WorkflowTag[] = [];
  for (const tag of tags) {
    const parsed = parseWorkflowTag(tag,);
    if (parsed) { out.push(parsed,); }
  }
  return out;
}
