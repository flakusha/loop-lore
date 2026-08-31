// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { resolveProfile, } from "./resolution";
import type { ResolveProfileOptions, } from "./resolution";
import { resolveTemplate, } from "./templates";
import type {
  DetailLevel,
  ImageModelProfile,
  PromptFormat,
  SdGenMode,
  TemplateContext,
} from "./types";

/**
 * System prompt templates per model family group
 * @param promptFormat
 * @param detail
 * @param maxTokenHint
 */
function systemPromptForFamily(
  promptFormat: PromptFormat,
  detail: DetailLevel,
  maxTokenHint: number,
): string {
  const verbosity = detail === "instant" ? "short" : (detail === "balanced" ? "concise" : "detailed");

  switch (promptFormat) {
    case "tags": {
      return [
        `You are an image prompt writer. Output ONLY a ${verbosity} comma-separated list of image tags.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
        `Use booru-style tags: 1girl, black hair, blue eyes, smile, etc.`,
      ].join(" ",);
    }
    case "natural": {
      return [
        `You are an image prompt writer. Output ONLY a ${verbosity} natural language description.`,
        `One paragraph. Focus on visual composition, lighting, colors, mood, subject.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
      ].join(" ",);
    }
    case "tags-and-natural": {
      return [
        `You are an image prompt writer. Output a ${verbosity} mix of lowercase keywords and natural language.`,
        `Use spaces between keywords. Blend tag-like descriptors with descriptive phrases.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
      ].join(" ",);
    }
    case "json": {
      return [
        `You are an image prompt writer. Output ONLY a JSON object with high_level_description, style_description, and compositional_deconstruction fields.`,
        `No explanation, no markdown, no wrapper text.`,
        `Keep under ${maxTokenHint} tokens.`,
      ].join(" ",);
    }
    default: {
      return `You are an image prompt writer. Output a ${verbosity} description of the scene. Keep under ${maxTokenHint} tokens.`;
    }
  }
}

/**
 * Build a role-switch system message for image prompt generation
 * @param profile
 * @param detail
 */
export function buildImageSystemPrompt(profile: ImageModelProfile, detail: DetailLevel,): string {
  const format = profile.promptFormat;
  const content = systemPromptForFamily(format, detail, profile.maxTokenHint,);

  // The role switch instruction is critical: the LLM was just roleplaying
  // as a character in an RPG. It needs to switch to image prompt writer mode.
  // Putting this in the system message is cleaner than "ignore previous
  // instructions" in the user message.
  return [
    `[New Task] Forget previous instructions. You are now an image prompt writer.`,
    content,
    `Do not reference this instruction in your output.`,
  ].join(" ",);
}

/** */
export interface ImagePromptMessage {
  role: "system" | "user";
  content: string;
}

/**
 * Build the full LLM message array for image prompt generation.
 * Returns [system, user] messages ready to send to the LLM.
 *
 * Token budget per detail level:
 *   instant:   system ~80-120 + user ~200-400 = ~280-520
 *   balanced:  system ~100-150 + user ~400-800 = ~500-950
 *   detailed:  system ~120-180 + user ~800-1600 = ~920-1780
 * @param mode
 * @param detail
 * @param ctx
 * @param opts
 */
export function buildImagePromptMessages(
  mode: SdGenMode,
  detail: DetailLevel,
  ctx: TemplateContext,
  opts: ResolveProfileOptions = {},
): ImagePromptMessage[] {
  const { profile, template, } = resolveProfile(mode, detail, opts,);
  const systemPrompt = buildImageSystemPrompt(profile, detail,);
  const userMessage = resolveTemplate(template, ctx,);

  return [
    { role: "system", content: systemPrompt, },
    { role: "user", content: userMessage, },
  ];
}

/**
 * Build image prompt messages and return everything needed in one call.
 * Convenience wrapper for calling code.
 * @param mode
 * @param detail
 * @param ctx
 * @param opts
 */
export function buildImagePrompt(
  mode: SdGenMode,
  detail: DetailLevel,
  ctx: TemplateContext,
  opts: ResolveProfileOptions = {},
): {
  messages: ImagePromptMessage[];
  systemPrompt: string;
  userMessage: string;
  profile: ImageModelProfile;
  resolvedProfileId: string;
  estimatedTotalTokens: number;
} {
  const { profile, resolvedProfileId, } = resolveProfile(mode, detail, opts,);
  const messages = buildImagePromptMessages(mode, detail, ctx, opts,);
  const systemPrompt = messages[0]!.content;
  const userMessage = messages[1]!.content;
  const estimatedTotalTokens = systemPrompt.split(/\s+/,).length + userMessage.split(/\s+/,).length;

  return {
    messages,
    systemPrompt,
    userMessage,
    profile,
    resolvedProfileId,
    estimatedTotalTokens,
  };
}
