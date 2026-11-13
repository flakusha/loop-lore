// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * acp-session-update.ts — the ACP `session/update` stream narrowed to the
 * variants loop-lore persists.
 *
 * Pure: no IO, no clock, no framework. The adapter feeds it raw notification
 * params; the collector (turn-transcript.ts) folds the events into a turn.
 *
 * Wire shapes (vendored ACP protocol):
 * - `agent_message_chunk` / `agent_thought_chunk`:
 *   `{ update: { sessionUpdate, content: { type: "text", text } } }`
 * - `tool_call`:
 *   `{ update: { sessionUpdate: "tool_call", toolCallId, title, name?, kind?, status?, rawInput? } }`
 * - `tool_call_update`:
 *   `{ update: { sessionUpdate: "tool_call_update", toolCallId, status?, content?, rawOutput? } }`
 * - `usage_update`:
 *   `{ update: { sessionUpdate: "usage_update", used, size, cost?: { amount, currency } } }`
 */

import { jsonStringifyOr, } from "../../utils";

/** One narrowed ACP session/update event. */
export type HarnessTurnEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | {
    type: "tool-call";
    toolCallId: string;
    name: string;
    kind: string | null;
    arguments: string;
  }
  | {
    type: "tool-result";
    toolCallId: string;
    name: string | null;
    status: string;
    content: string;
    error: boolean;
  }
  | {
    type: "usage";
    used: number | null;
    size: number | null;
    costUsd: number | null;
    currency: string | null;
  };

/**
 * The events the transcript collector folds. `usage` is telemetry about the
 * session, not turn content, so it stays out of the transcript.
 */
export type HarnessContentEvent = Exclude<HarnessTurnEvent, { type: "usage" }>;

/** Tool-call statuses that mean the call is over — only these become rows. */
const TERMINAL_TOOL_STATUSES = new Set(["completed", "failed",],);

/** A tool status that ends the call. */
export function isTerminalToolStatus(status: string,): boolean {
  return TERMINAL_TOOL_STATUSES.has(status,);
}

/** Readable result text: the content blocks, else the raw output, else empty. */
function toolResultContent(content: unknown, rawOutput: unknown,): string {
  const text = toolContentText(content,);
  if (text) { return text; }
  if (rawOutput === undefined || rawOutput === null) { return ""; }
  return jsonStringifyOr(rawOutput,);
}

/** Narrow an unknown value to a plain record, or null. */
function asRecord(value: unknown,): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : null;
}

/** Narrow an unknown value to a string, or null. */
function asString(value: unknown,): string | null {
  return typeof value === "string" ? value : null;
}

/** Narrow an unknown value to a finite number, or null. */
function asNumber(value: unknown,): number | null {
  return typeof value === "number" && Number.isFinite(value,) ? value : null;
}

/** Narrow a `usage_update` payload to its usage event (cost in USD). */
function usageEvent(update: Record<string, unknown>,): HarnessTurnEvent[] {
  const cost = asRecord(update.cost,);
  const amount = cost ? asNumber(cost.amount,) : null;
  const currency = cost ? asString(cost.currency,) : null;
  return [{
    type: "usage",
    used: asNumber(update.used,),
    size: asNumber(update.size,),
    costUsd: amount !== null && currency?.toLowerCase() === "usd" ? amount : null,
    currency,
  },];
}

/** Readable text of a tool-call content list (text blocks and diffs). */
function toolContentText(content: unknown,): string {
  if (!Array.isArray(content,)) { return ""; }
  const parts: string[] = [];
  for (const item of content) {
    const entry = asRecord(item,);
    if (!entry) { continue; }
    if (entry.type === "content") {
      const inner = asRecord(entry.content,);
      const text = inner ? asString(inner.text,) : null;
      if (text) { parts.push(text,); }
      continue;
    }

    if (entry.type === "diff") {
      const newText = asString(entry.newText,);
      if (newText) { parts.push(newText,); }
    }
  }

  return parts.join("\n",);
}

/**
 * Narrow a raw ACP `session/update` notification payload to the events
 * loop-lore persists. Unknown variants (plan, current_mode_update, ...) and
 * malformed payloads yield no events — they are telemetry-only for now;
 * `usage_update` is kept as a usage event (the reported cost is USD).
 * @param params - the notification params, untrusted
 * @returns the narrowed events; empty when the payload carries none
 */
export function narrowSessionUpdate(params: unknown,): HarnessTurnEvent[] {
  const outer = asRecord(params,);
  const update = outer ? asRecord(outer.update,) : null;
  if (!update) { return []; }

  const variant = asString(update.sessionUpdate,);
  if (variant === "agent_message_chunk" || variant === "agent_thought_chunk") {
    const content = asRecord(update.content,);
    const text = content ? asString(content.text,) : null;
    if (!text) { return []; }
    return variant === "agent_message_chunk" ? [{ type: "text", text, },] : [{ type: "thinking", text, },];
  }

  if (variant === "tool_call") {
    const toolCallId = asString(update.toolCallId,);
    if (!toolCallId) { return []; }
    const name = asString(update.name,) ?? asString(update.title,) ?? asString(update.kind,) ?? "tool";
    const status = asString(update.status,);
    const events: HarnessTurnEvent[] = [{
      type: "tool-call",
      toolCallId,
      name,
      kind: asString(update.kind,),
      arguments: jsonStringifyOr(update.rawInput ?? {},),
    },];

    // A harness may report the finished call in the initial notification
    // instead of a follow-up update — treat a terminal status as its result.
    if (status && isTerminalToolStatus(status,)) {
      events.push({
        type: "tool-result",
        toolCallId,
        name,
        status,
        content: toolResultContent(update.content, update.rawOutput,),
        error: status === "failed",
      },);
    }

    return events;
  }

  if (variant === "tool_call_update") {
    const toolCallId = asString(update.toolCallId,);
    if (!toolCallId) { return []; }
    const status = asString(update.status,) ?? "in_progress";
    const name = asString(update.name,) ?? asString(update.title,);
    const events: HarnessTurnEvent[] = [];
    if (name) {
      events.push({
        type: "tool-call",
        toolCallId,
        name,
        kind: asString(update.kind,),
        arguments: jsonStringifyOr(update.rawInput ?? {},),
      },);
    }

    events.push({
      type: "tool-result",
      toolCallId,
      name,
      status,
      content: toolResultContent(update.content, update.rawOutput,),
      error: status === "failed",
    },);

    return events;
  }

  if (variant === "usage_update") {
    return usageEvent(update,);
  }

  return [];
}
