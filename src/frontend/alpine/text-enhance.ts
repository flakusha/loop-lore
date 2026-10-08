// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Standalone LLM text enhancement — the composer's improve chain lifted
 * out of Alpine state so any text surface (GM guidance, bios, world notes)
 * can enhance text without `$refs` or an active chat.
 */
import { promptContent, type PromptRequestFailure, requestPrompt, } from "./chat-actions/prompt-request";
import { getLocalEngine, } from "./local-engine";
import { LocalInferenceUnavailable, runLocalPromptImprove, shouldOffloadTask, } from "./local-inference";
import type { LocalInferenceResult, } from "./local-inference";
import { runLocalModelImprove, } from "./local-model-improve";

/** Request for {@link enhanceText}. */
export interface EnhanceTextRequest {
  text: string;
  level: string;
  chatId?: string;
}

/** Optional observer hooks preserving the composer's toast/log behavior. */
export interface EnhanceTextHooks {
  /** Local inference served the request; `engine` names it. */
  onLocal?: (engine: string,) => void;
  /** Server round-trip failed; the composer maps this to toast copy. */
  onServerFailure?: (failure: PromptRequestFailure,) => void;
}

/**
 * Opt-in browser inference: deterministic cleanup first, then the downloaded
 * browser model when one is flagged ready. Anything unavailable returns null
 * and the caller falls back to the server — local inference never blocks.
 * @param text - Draft to improve.
 * @param level - Gradation level.
 * @returns Local result, or null when the server should handle it.
 * @throws Rethrows unexpected local-inference errors (non-unavailability).
 */
async function tryLocalImprove(text: string, level: string,): Promise<LocalInferenceResult | null> {
  if (!shouldOffloadTask("prompt-improve",)) { return null; }
  try {
    return runLocalPromptImprove({ text, level, },);
  } catch (error) {
    if (!(error instanceof LocalInferenceUnavailable)) { throw error; }
  }

  try {
    return await runLocalModelImprove(getLocalEngine(), { text, level, },);
  } catch (error) {
    if (!(error instanceof LocalInferenceUnavailable)) { throw error; }
    return null;
  }
}

/**
 * Enhance text local-first: deterministic cleanup, then the browser model,
 * then POST /api/v1/generation/prompt.
 * @param request - Text, gradation level, optional chat id.
 * @param hooks - Optional local/failure observers (toast wiring stays with
 *   the caller).
 * @returns The improved text, or null when every path failed.
 * @throws Rethrows unexpected local-inference errors.
 */
export async function enhanceText(
  request: EnhanceTextRequest,
  hooks: EnhanceTextHooks = {},
): Promise<string | null> {
  const local = await tryLocalImprove(request.text, request.level,);
  if (local) {
    hooks.onLocal?.(local.engine,);
    return local.content;
  }

  const result = await requestPrompt({
    mode: "improve",
    level: request.level,
    text: request.text,
    chatId: request.chatId,
  },);

  if (!result.ok) {
    hooks.onServerFailure?.(result,);
    return null;
  }

  return promptContent(result.data,);
}

/** Bounded LIFO of pre-enhancement values for non-destructive undo. */
export class UndoEnhance {
  private readonly stack: string[] = [];

  constructor(private readonly maxDepth = 5,) {}

  /** @param value - Text to remember for a later undo. */
  push(value: string,): void {
    this.stack.push(value,);
    if (this.stack.length > this.maxDepth) { this.stack.shift(); }
  }

  /** @returns The most recent value, or undefined when the stack is empty. */
  pop(): string | undefined {
    return this.stack.pop();
  }

  /** @returns Values currently remembered. */
  get depth(): number {
    return this.stack.length;
  }
}
