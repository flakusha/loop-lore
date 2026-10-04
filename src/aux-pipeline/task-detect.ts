// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Task Detection from Prompt Shape
 *
 * Mock providers (tests/e2e, prompt-eval harness) receive only the resolved
 * message array — the AUX task name never crosses the provider boundary.
 * Detection matches distinctive markers of the default system prompts in
 * `prompts.ts`; config-level system-prompt overrides fall through to null
 * and callers use their fallback reply.
 */
import type { AuxTaskName, } from "./types";

/** Distinctive, stable substring of each default AUX system prompt. */
const TASK_MARKERS: readonly (readonly [AuxTaskName, string,])[] = [
  ["transition", "transition detector",],
  ["intent", "Classify the user message intent",],
  ["intent", "You are a turn director for a roleplay chat",],
  ["gm-tool", "GM tool detector",],
  ["nsfw", "content rating classifier",],
  ["moderation", "content moderation classifier",],
  ["injection-check", "prompt-injection detector",],
  ["memory", "Extract key facts",],
] as const;

/**
 * Detect which AUX task a resolved message array belongs to.
 * @param messages - Chat-style messages as sent to the provider
 * @returns Task name, or null when no default prompt marker matches
 */
export function detectAuxTask(
  messages: readonly { role: string; content: string }[],
): AuxTaskName | null {
  const system = messages.find((m,) => m.role === "system")?.content ?? "";
  if (!system) { return null; }
  for (const [task, marker,] of TASK_MARKERS) {
    if (system.includes(marker,)) { return task; }
  }
  return null;
}
