// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt template payload rendering (FEAT-065).
 *
 * Renders stored image / simple (video/audio) payloads with {{variable}}
 * substitution. LLM payloads render through `assistant/prompt/template-render`.
 */
import type { ImageTemplatePayload, SimpleTemplatePayload, } from "../template-types";

/**
 * Render an image template payload against a variable context.
 * Unknown variables are substituted with empty strings — see
 * `resolveTemplate` in `./prompt-templates/templates.ts`.
 * @param payload - Parsed image payload
 * @param ctx - Variable map (TemplateContext-compatible)
 */
export function applyImageTemplate(
  payload: ImageTemplatePayload,
  ctx: Record<string, string | undefined>,
): { prompt: string; negativePrompt: string | undefined } {
  let prompt = payload.templateBody;
  for (const [key, value,] of Object.entries(ctx,)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value ?? "",);
  }
  // Unknown variables render empty — same contract as resolveTemplate().
  prompt = prompt.replace(/\{\{[^}]+\}\}/g, "",);
  return { prompt, negativePrompt: payload.negativePrompt, };
}

/**
 * Render a simple (video/audio) template payload with variable substitution
 * and default params.
 * @param payload - Parsed simple payload
 * @param vars - Variable overrides on top of `params`
 */
export function applySimpleTemplate(
  payload: SimpleTemplatePayload,
  vars: Record<string, string> = {},
): string {
  const merged = { ...payload.params, ...vars, };
  let body = payload.body;
  for (const [key, value,] of Object.entries(merged,)) {
    body = body.replaceAll(`{{${key}}}`, value,);
  }
  return body;
}
