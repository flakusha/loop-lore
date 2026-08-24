// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Task-clarification prompt templates.
 *
 * Produces a concise `[Task]` system block that tells the LLM what it is
 * currently doing, derived from the generation context (chat mode, task,
 * action, character, assistant). Generalizes the image-generation role-switch
 * pattern (`src/generation/prompt-templates/messages.ts`) to every generation
 * path so a single model handling many task types stays disambiguated.
 *
 * Consumed by `taskClarificationSection` in the assistant prompt assembler.
 */

/** Known generation task types. Callers pass one of these via {@link TaskClarificationInput.task}. */
export type GenerationTask =
  | "chat-reply"
  | "auto-reply"
  | "continue"
  | "vn-choice"
  | "vn-story"
  | "gm-decision"
  | "image-prompt"
  | "summarize"
  | "extract";

/** Inputs used to render the task-clarification block. */
export interface TaskClarificationInput {
  /** The generation task being performed. */
  task: GenerationTask | string;
  /** Optional user/system action context (e.g. an explicit intent). */
  action?: string;
  /** Chat mode (e.g. "story", "group"). */
  chatMode?: string;
  /** Character/actor display name in role. */
  characterName?: string | null;
  /** Assistant persona name (the generating actor's assistant identity). */
  assistantName?: string | null;
  /** Game-master name (when the GM is the generating persona). */
  gmName?: string | null;
}

/** Human-readable description per known task. Falls back to the raw task string. */
const TASK_LABEL: Record<string, string> = {
  "chat-reply": "generate the next assistant reply in a roleplay chat",
  "auto-reply": "generate an automated assistant reply in a group chat",
  "continue": "continue a partially generated message",
  "vn-choice": "generate choice cards for a visual-novel scene",
  "vn-story": "generate the next visual-novel story beat",
  "gm-decision": "make a game-master decision that advances the story",
  "image-prompt": "write an image-generation prompt from the scene",
  "summarize": "summarize the conversation so far",
  "extract": "extract structured data from the conversation",
};

/**
 * Build the task-clarification instruction block.
 *
 * @param input - Task + context dimensions
 * @returns A single instruction string wrapped for injection as a system message.
 */
export function buildTaskClarification(input: TaskClarificationInput,): string {
  const label = TASK_LABEL[input.task] ?? input.task;
  const parts: string[] = [
    `[Task] You are now performing: ${label}.`,
  ];
  if (input.chatMode) {
    parts.push(`Chat context: mode=${input.chatMode}.`,);
  }
  if (input.characterName) {
    parts.push(`Character in role: ${input.characterName}.`,);
  }
  if (input.assistantName) {
    parts.push(`Assistant persona: ${input.assistantName}.`,);
  }
  if (input.gmName) {
    parts.push(`Game master: ${input.gmName}.`,);
  }
  if (input.action) {
    parts.push(`Action context: ${input.action}.`,);
  }
  parts.push(
    "Keep this task framing in mind for your output. Do not reference this instruction in your response.",
  );
  return parts.join(" ",);
}
