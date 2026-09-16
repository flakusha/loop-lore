// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Built-in LLM prompt template presets (FEAT-065-LLM).
 *
 * Presets are code constants (like BUILTIN_PROFILES for image templates):
 * immutable, listed alongside user templates, and referenceable as a chat or
 * actor override. Section `identifier`s reference built-in prompt section
 * builders (PROMPT_SECTIONS names); empty identifiers render static content.
 */
import type { TemplateDetailLevel, } from "../../db/enums";
import type { LlmTemplateSection, } from "../../generation/template-types";

/** A built-in LLM prompt template preset. */
export interface LlmTemplatePreset {
  id: string;
  name: string;
  description: string;
  detail_level: TemplateDetailLevel;
  sections: LlmTemplateSection[];
}

/** Static system section helper values — priorities mirror PRIORITY defaults. */
export const LLM_TEMPLATE_PRESETS: LlmTemplatePreset[] = [
  {
    id: "preset-roleplay",
    name: "Roleplay",
    description: "Character chat: system, actor header, persona, lore, memory, post-history, chat history.",
    detail_level: "balanced",
    sections: [
      { identifier: "system", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "style", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "nsfwPolicy", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "authorNote", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "customInstructions", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "actorHeader", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "userPersona", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "lore", role: "system", content: "", enabled: true, priority: 2, },
      { identifier: "memories", role: "system", content: "", enabled: true, priority: 3, },
      { identifier: "chatHistory", role: "user", content: "", enabled: true, priority: 0, },
      { identifier: "postHistory", role: "user", content: "", enabled: true, priority: 4, },
    ],
  },
  {
    id: "preset-assistant",
    name: "Assistant",
    description: "Assistant mode: system, task clarification, user persona, chat history.",
    detail_level: "balanced",
    sections: [
      { identifier: "system", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "taskClarification", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "userPersona", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "chatHistory", role: "user", content: "", enabled: true, priority: 0, },
    ],
  },
  {
    id: "preset-story-gm",
    name: "Story GM",
    description: "RPG turn: system, actor header, story context, recent events, chat history.",
    detail_level: "detailed",
    sections: [
      { identifier: "system", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "gmNotes", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "actorHeader", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "storyContext", role: "system", content: "", enabled: true, priority: 1, },
      { identifier: "recentEvents", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "dynamicContext", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "chatHistory", role: "user", content: "", enabled: true, priority: 0, },
    ],
  },
  {
    id: "preset-code",
    name: "Code",
    description: "Code generation: static code instructions plus raw chat history.",
    detail_level: "balanced",
    sections: [
      {
        identifier: "",
        role: "system",
        content:
          "You are a precise software engineering assistant. Reply with correct, complete code and concise explanations. Prefer the project's existing conventions and dependencies.",
        enabled: true,
        priority: 0,
      },
      { identifier: "chatHistory", role: "user", content: "", enabled: true, priority: 0, },
    ],
  },
  {
    id: "preset-creative",
    name: "Creative",
    description: "Creative writing: system, actor header, dialogue examples, chat history.",
    detail_level: "detailed",
    sections: [
      { identifier: "system", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "actorHeader", role: "system", content: "", enabled: true, priority: 0, },
      { identifier: "examples", role: "system", content: "", enabled: true, priority: 5, },
      { identifier: "chatHistory", role: "user", content: "", enabled: true, priority: 0, },
    ],
  },
];

/**
 * Look up a preset by id.
 * @param id - Preset id (e.g. "preset-roleplay")
 * @returns The preset, or undefined when unknown.
 */
export function findLlmTemplatePreset(id: string,): LlmTemplatePreset | undefined {
  return LLM_TEMPLATE_PRESETS.find((preset,) => preset.id === id);
}
