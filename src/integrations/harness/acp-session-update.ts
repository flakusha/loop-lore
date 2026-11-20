// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 * - `current_mode_update`:
 *   `{ update: { sessionUpdate: "current_mode_update", currentModeId } }`
 * - `plan` (v1) / `plan_update` (v2):
 *   `{ update: { sessionUpdate: "plan", entries: [{ content, priority }] } }`
 *   `{ update: { sessionUpdate: "plan_update", plan: { planId, entries: [{ content, priority }] } } }`
 */

import { jsonStringifyOr, } from "../../utils";

/** One narrowed ACP session/update event. */
export type HarnessTurnEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "mode"; modeId: string }
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
  }
  | {
    type: "plan";
    /** v2 `planId`; null for the v1 `plan` variant, which carries none. */
    planId: string | null;
    /** Entries in the order the harness sent them. */
    entries: HarnessPlanEntry[];
  };

/** One step of an agent-reported plan: what to do and how urgent it is. */
export interface HarnessPlanEntry {
  /** Human-readable step description (plain text or Markdown). */
  content: string;
  /** Relative importance (`high`/`medium`/`low`); null when unreported. */
  priority: string | null;
}

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

/**
 * Narrow a `plan` (v1) or `plan_update` (v2) payload to its plan event,
 * preserving entry order and priority. Entries without readable content are
 * dropped; a payload with no readable entry yields no event.
 * @param update - the raw `update` object
 */
function planEvent(update: Record<string, unknown>,): HarnessTurnEvent[] {
  const plan = asRecord(update.plan,);
  const rawEntries = updateEntries(plan ? plan["entries"] : update["entries"],);
  const entries: HarnessPlanEntry[] = [];
  for (const item of rawEntries) {
    const entry = asRecord(item,);
    const content = entry ? asString(entry["content"],) : null;
    if (!content) { continue; }
    entries.push({ content, priority: entry ? asString(entry["priority"],) : null, },);
  }

  if (entries.length === 0) { return []; }
  return [{ type: "plan", planId: plan ? asString(plan["planId"],) : null, entries, },];
}

/** Narrow an unknown value to an entry list, or empty. */
function updateEntries(value: unknown,): unknown[] {
  return Array.isArray(value,) ? value : [];
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
 * loop-lore persists. Unknown variants and malformed payloads yield no
 * events — they are telemetry-only for now; `usage_update` is kept as a usage
 * event (the reported cost is USD), `current_mode_update` as a mode event,
 * and plans as plan events.
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

  if (variant === "current_mode_update") {
    const modeId = asString(update.currentModeId,);
    return modeId ? [{ type: "mode", modeId, },] : [];
  }

  if (variant === "plan" || variant === "plan_update") {
    return planEvent(update,);
  }

  if (variant === "usage_update") {
    return usageEvent(update,);
  }

  return [];
}
