// ── Core generation dispatchers ─────────────────────────
//
// Extracted from the `OpenAiCompatibleProvider` class body. Each dispatcher is
// threaded with an explicit `state` handle (the class's private fields).

import type {
  GenerateRequest,
  GenerateResponse,
  StreamHandler,
} from "../types";
import { ProviderError, } from "../types";
import { buildBody, fetchRaw, fetchWithRetry, handleErrorResponse, mapFinishReason, } from "./http";
import { parseSSELine, } from "./sse";
import type { OpenAiCompatibleState, OpenAIResponse, OpenAIStreamChunk, } from "./types";

export async function completeDispatch(
  state: OpenAiCompatibleState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, false,);
  const response = await fetchWithRetry(state, "/chat/completions", body, req.signal, req.apiKey,);
  const data = response as OpenAIResponse;

  const choice = data.choices?.[0];
  if (!choice) {
    throw new ProviderError("Empty response from provider", undefined, 500, true,);
  }

  const toolCalls = choice.message?.tool_calls
    ? Array.from(choice.message.tool_calls, (tc,) => ({
      id: tc.id,
      type: tc.type,
      function: { name: tc.function.name, arguments: tc.function.arguments, },
    }),)
    : undefined;

  return {
    content: choice.message?.content ?? "",
    thinking: choice.message?.reasoning_content,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: mapFinishReason(choice.finish_reason,),
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

export async function streamDispatch(
  state: OpenAiCompatibleState,
  req: GenerateRequest,
  handler: StreamHandler,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, true,);
  const signal = req.signal;

  const url = new URL(`${state.baseUrl}/chat/completions`,);
  const response = await fetchRaw(state, url.href, body, signal, req.apiKey,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ProviderError("No response body for streaming", undefined, 500, true,);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullContent = "";
  let fullThinking = "";
  const toolCallAccum = new Map<
    number,
    {
      id?: string;
      type?: "function";
      function: { name?: string; arguments: string };
    }
  >();
  let finishReason: "stop" | "length" | "error" | "cancelled" = "stop";
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, };

  try {
    while (true) {
      const { done, value, } = await (reader.read() as Promise<{ done: boolean; value?: Uint8Array }>);
      if (done) { break; }

      buffer += decoder.decode(value, { stream: true, },);
      const lines = buffer.split("\n",);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (signal?.aborted) {
          finishReason = "cancelled";
          break;
        }
        const parsed = parseSSELine(line,);
        if (!parsed) { continue; }
        if (parsed._done === "true") {
          handler({ type: "done", finishReason: "stop", },);
          continue;
        }

        const data = parsed as unknown as OpenAIStreamChunk;
        const delta = data.choices?.[0]?.delta;
        if (!delta) { continue; }

        if (delta.content) {
          fullContent += delta.content;
          handler({ type: "content", content: delta.content, },);
        }
        if (delta.reasoning_content) {
          fullThinking += delta.reasoning_content;
          handler({ type: "thinking", content: delta.reasoning_content, },);
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolCallAccum.get(tc.index,) ?? { function: { arguments: "", }, };
            if (tc.id) { existing.id = tc.id; }
            if (tc.type) { existing.type = tc.type; }
            if (tc.function?.name) { existing.function.name = tc.function.name; }
            if (tc.function?.arguments) { existing.function.arguments += tc.function.arguments; }
            toolCallAccum.set(tc.index, existing,);
          }
        }

        const finish = data.choices?.[0]?.finish_reason;
        if (finish && finish !== "null") {
          finishReason = mapFinishReason(finish,);
          if (data.usage) {
            usage = {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            };
          }
          handler({ type: "done", finishReason, },);
        }
      }

      if (signal?.aborted) { break; }
    }
  } catch (error) {
    if (signal?.aborted) {
      finishReason = "cancelled";
    } else {
      throw error;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* reader already released */
    }
  }

  const toolCalls = toolCallAccum.size > 0
    ? Array.from(
      [...toolCallAccum,].sort(([a,], [b,],) => a - b),
      ([, v,],) => ({
        id: v.id ?? "",
        type: v.type ?? ("function" as const),
        function: { name: v.function.name ?? "", arguments: v.function.arguments, },
      }),
    )
    : undefined;

  if (toolCalls) {
    for (const tc of toolCalls) {
      handler({ type: "tool_call", toolCall: tc, },);
    }
  }

  return {
    content: fullContent,
    thinking: fullThinking || undefined,
    toolCalls,
    finishReason,
    usage,
  };
}
