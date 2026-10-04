// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared Mock LLM Provider — for unit + e2e tests.
 *
 * Implements LLMProvider interface. Configurable failure/stream-error flags.
 * Used by:
 *   - src/generation/generate-route.test.ts (unit)
 *
 * Register via registerProvider("name", mock) before use.
 */

import { detectAuxTask, } from "@/aux-pipeline/task-detect";
import type { AuxTaskName, } from "@/aux-pipeline/types";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelInfo,
  ProviderCapabilities,
  StreamHandler,
} from "@/generation/providers/types";

const MOCK_CAPABILITIES: ProviderCapabilities = {
  type: "openai-compatible",
  label: "Mock LLM",
  text: true,
  image: false,
  embeddings: false,
  streaming: true,
  tools: false,
  thinking: false,
};

/** Deterministic token usage reported by every mock response. */
const MOCK_USAGE = { promptTokens: 10, completionTokens: 20, totalTokens: 30, } as const;

/** */
export class MockLLMProvider implements LLMProvider {
  private _failOnCall = false;
  private _streamError = false;
  /** Per-task scripted replies (task detected from the system prompt). */
  private taskReplies = new Map<AuxTaskName, string>();
  /** Exact-input scripted replies — key `${task}\u0000${userText}`. */
  private inputReplies = new Map<string, string>();
  readonly capabilities = MOCK_CAPABILITIES;

  /** Throw ProviderError on complete()/stream() */
  set failOnCall(v: boolean,) {
    this._failOnCall = v;
  }
  /**
   * @returns current `failOnCall` flag.
   */
  get failOnCall(): boolean {
    return this._failOnCall;
  }

  /** Throw on stream() specifically */
  set streamError(v: boolean,) {
    this._streamError = v;
  }
  /**
   * @returns current `streamError` flag.
   */
  get streamError(): boolean {
    return this._streamError;
  }

  /**
   * Script a canned reply for all calls of one AUX task (detected from the
   * system-prompt shape). Un-keyed tasks keep the legacy canned response.
   * @param task - AUX task the reply applies to
   * @param reply - Raw provider content to return
   */
  setTaskReply(task: AuxTaskName, reply: string,): void {
    this.taskReplies.set(task, reply,);
  }

  /**
   * Script a reply for one exact user message within a task (eval fixtures).
   * Takes precedence over the task-level reply.
   * @param task - AUX task the reply applies to
   * @param input - Exact user-message text to match
   * @param reply - Raw provider content to return
   */
  setInputReply(task: AuxTaskName, input: string, reply: string,): void {
    this.inputReplies.set(`${task}\u0000${input}`, reply,);
  }

  /** Clear every scripted reply — back to pure legacy canned behavior. */
  clearScriptedReplies(): void {
    this.taskReplies.clear();
    this.inputReplies.clear();
  }

  /**
   * Resolve the content for a request: exact-input reply → task reply → null.
   * @param req - generate request (task inferred from the system prompt)
   * @returns Scripted content, or null when nothing is scripted for the request
   */
  private resolveScriptedContent(req: GenerateRequest,): string | null {
    const task = detectAuxTask(req.messages,);
    if (!task) { return null; }
    const userText = [...req.messages,].reverse().find((m,) => m.role === "user")?.content ?? "";
    return this.inputReplies.get(`${task}\u0000${userText}`,) ?? this.taskReplies.get(task,) ?? null;
  }

  /**
   * @param req - generate request (scripted-reply lookup by prompt shape)
   * @returns mock `GenerateResponse` with deterministic token usage.
   * @throws {Error} `"Mock provider failure"` when `failOnCall` is set.
   */
  complete(req: GenerateRequest,): Promise<GenerateResponse> {
    if (this._failOnCall) { throw new Error("Mock provider failure",); }
    return Promise.resolve({
      content: this.resolveScriptedContent(req,) ?? "Mock response content",
      thinking: undefined,
      finishReason: "stop",
      usage: MOCK_USAGE,
    },);
  }

  /**
   * @param req - generate request (scripted-reply lookup by prompt shape)
   * @param handler - stream handler invoked for each chunk + done event
   * @returns mock `GenerateResponse` describing the streamed completion.
   * @throws {Error} `"Mock stream failure"` when `streamError` is set.
   */
  stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    if (this._streamError) {
      throw new Error("Mock stream failure",);
    }

    const scripted = this.resolveScriptedContent(req,);
    const full = scripted ?? "Mock streamed response";
    const words = full.split(" ",);
    for (let i = 0; i < words.length; i++) {
      // Trailing space on every chunk but the last — the concatenation of all
      // content chunks must equal `full` exactly.
      const chunk = i < words.length - 1 ? `${words[i]} ` : words[i];
      handler({ type: "content", content: chunk, },);
    }

    handler({
      type: "done",
      finishReason: "stop",
      usage: MOCK_USAGE,
    },);

    return Promise.resolve({
      content: full,
      thinking: undefined,
      finishReason: "stop",
      usage: MOCK_USAGE,
    },);
  }

  /**
   * @returns `{ status: "ok" }` health probe response.
   */
  healthCheck(): Promise<{ status: "ok" }> {
    return Promise.resolve({ status: "ok" as const, },);
  }

  /**
   * @returns array containing a single `"mock-model"` model descriptor.
   */
  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([{ id: "mock-model", },],);
  }
}
