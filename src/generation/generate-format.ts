// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Apply a chat-format template (Jinja/vLLM-style `${content}` placeholder) to
 * each message in the array. Used by the generate route when a caller passes
 * `format: <key>` and the config defines the matching entry under
 * `templates.llm.chatFormats`.
 *
 * Role mapping:
 *   system     → template.system
 *   user       → template.user
 *   assistant  → template.assistant
 *   character  → template.assistant (in-character assistant message)
 *   tool       → passthrough (no wrapping — tool calls carry structured payloads)
 *
 * Templates without `${content}` append the content to the template string.
 * Templates with empty string for a role are skipped (role unwrapped).
 *
 * @throws never (pure transformation; unknown format keys are a caller concern)
 */
import type { ChatFormatTemplate, } from "../config/sections/templates";
import type { GenerationMessage, } from "./types";

export function applyChatFormat(
  messages: readonly GenerationMessage[],
  template: ChatFormatTemplate,
): GenerationMessage[] {
  const wrappers: Readonly<Record<"system" | "user" | "assistant", string>> = {
    system: template.system,
    user: template.user,
    assistant: template.assistant,
  };
  return messages.map((msg,) => {
    if (msg.role === "tool") { return msg; }
    const key = msg.role === "character" ? "assistant" : msg.role;
    const wrapper = wrappers[key as keyof typeof wrappers];
    if (!wrapper) { return msg; }
    const wrapped = wrapper.includes("${content}",)
      ? wrapper.replace("${content}", msg.content,)
      : `${wrapper}${msg.content}`;
    return { ...msg, content: wrapped, };
  },);
}
