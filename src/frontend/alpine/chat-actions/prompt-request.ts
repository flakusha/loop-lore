// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Transport for POST /api/v1/generation/prompt — the unified prompt service
 * behind the composer's Improve/Analyze actions and the per-message Improve
 * affordance. All three previously spelled the same fetch + error-body
 * parse + `data.data.content` unwrap inline.
 */
import { jsonBody, } from "../json";

/** Fields accepted by the unified prompt endpoint. */
export interface PromptRequest {
  mode: "improve" | "analyze";
  text: string;
  chatId: string;
  /** Gradation level; omitted for `analyze`. */
  level?: string;
}

/**
 * Failure branch of a prompt request. `message` is the server's own error
 * text when it sent one; callers decide the toast copy. `injectionBlocked`
 * separates the 403 moderation verdict from ordinary failures.
 */
export type PromptRequestFailure = {
  ok: false;
  status: number;
  message: string | undefined;
  injectionBlocked: boolean;
};

/**
 * POST the prompt request and unwrap `data.data`.
 * @param request - Endpoint payload.
 * @returns Parsed `data` envelope on success, or the failure branch.
 */
export async function requestPrompt(
  request: PromptRequest,
): Promise<{ ok: true; data: unknown } | PromptRequestFailure> {
  // Resolved off globalThis at call time (not a module binding) so the
  // existing test seam that swaps globalThis.apiFetch keeps working.
  const res = await globalThis.apiFetch(
    "/api/v1/generation/prompt",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(request,),
    } as RequestInit,
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: undefined, })) as { message?: string };
    return {
      ok: false,
      status: res.status,
      message: error?.message,
      injectionBlocked: res.status === 403 && (error as { error?: string })?.error === "injection_detected",
    };
  }

  const payload = await res.json() as { data?: unknown };
  return { ok: true, data: payload?.data, };
}

/**
 * Narrow a prompt-service `data` payload to improved text. The service
 * returns `{ content }` for `improve`; anything else (including a 200 with an
 * empty envelope) is treated as a failure so callers never splice garbage
 * into a composer or message body.
 * @param data - The unwrapped `data` field from a successful request.
 * @returns The improved text, or null when absent/blank.
 */
export function promptContent(data: unknown,): string | null {
  const content = (data as { content?: unknown })?.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

/**
 * Run an `improve` round-trip and return the rewritten text.
 * @param request - Text, chat and gradation level.
 * @returns The improved text, or null when the request failed or the service
 *   returned an empty envelope. Callers own the failure toast copy.
 */
export async function requestImprovedContent(
  request: Omit<PromptRequest, "mode">,
): Promise<string | null> {
  const result = await requestPrompt({ ...request, mode: "improve", },);
  return result.ok ? promptContent(result.data,) : null;
}
