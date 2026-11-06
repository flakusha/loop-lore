// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * turn-transcript.ts — the collector that folds one turn's ACP stream into a
 * single transcript, plus the shapes the persistence layer reads.
 *
 * Pure: no IO, no clock, no framework. The adapter feeds it narrowed events
 * (acp-session-update.ts); the persistence layer reads the finished
 * transcript.
 */

import { type HarnessTurnEvent, isTerminalToolStatus, } from "./acp-session-update";

/** One tool call the harness reported, in the shape the message readers expect. */
export interface HarnessToolCall {
  /** ACP `toolCallId` — the join key with tool results. */
  id: string;
  /** Tool name (ACP `name`, falling back to `title`, then `kind`). */
  name: string;
  /** ACP tool kind (`read`, `edit`, ...), when the harness reported one. */
  kind: string | null;
  /** JSON-encoded tool input; `{}` when the harness sent none. */
  arguments: string;
}

/** One tool result the harness reported for a call. */
export interface HarnessToolResult {
  /** ACP `toolCallId` of the call this result belongs to. */
  toolCallId: string;
  /** Tool name, when known (an update may omit it). */
  name: string | null;
  /** ACP tool-call status (`completed`, `failed`, ...). */
  status: string;
  /** Result text; empty when the harness sent no readable content. */
  content: string;
  /** True when the call failed. */
  error: boolean;
}

/** One turn's collected transcript. */
export interface HarnessTurnTranscript {
  /** Assistant text chunks, concatenated in arrival order. */
  text: string;
  /** Reasoning chunks, in arrival order. */
  thinking: string[];
  /** Tool calls, in first-seen order (a later update replaces an entry in place). */
  toolCalls: HarnessToolCall[];
  /** Tool results, in first-seen order (a later terminal update replaces an entry in place). */
  toolResults: HarnessToolResult[];
}

/** An empty transcript — for adapters that report no streamed content. */
export function emptyTurnTranscript(): HarnessTurnTranscript {
  return { text: "", thinking: [], toolCalls: [], toolResults: [], };
}

/**
 * Collector for one turn's events. Tool calls and results are keyed by
 * `toolCallId` (last terminal write wins); a non-terminal update never
 * replaces a result the harness already finished.
 */
export class TurnTranscriptCollector {
  private text = "";
  private thinking: string[] = [];
  private calls: HarnessToolCall[] = [];
  private results: HarnessToolResult[] = [];

  /** Fold one event into the transcript. */
  append(event: HarnessTurnEvent,): void {
    if (event.type === "text") {
      this.text += event.text;
      return;
    }

    if (event.type === "thinking") {
      this.thinking.push(event.text,);
      return;
    }

    if (event.type === "tool-call") {
      this.appendCall(event,);
      return;
    }

    this.appendResult(event,);
  }

  /** The transcript collected so far (a copy — the collector keeps working). */
  snapshot(): HarnessTurnTranscript {
    return {
      text: this.text,
      thinking: [...this.thinking,],
      toolCalls: this.calls.map((call,) => ({ ...call, })),
      toolResults: this.results.map((result,) => ({ ...result, })),
    };
  }

  /** Record a tool call, replacing an earlier entry for the same id in place. */
  private appendCall(event: Extract<HarnessTurnEvent, { type: "tool-call" }>,): void {
    const index = this.calls.findIndex((call,) => call.id === event.toolCallId);
    if (index === -1) {
      this.calls.push({ id: event.toolCallId, name: event.name, kind: event.kind, arguments: event.arguments, },);
      return;
    }

    const previous = this.calls[index]!;
    this.calls[index] = {
      id: event.toolCallId,
      name: event.name,
      kind: event.kind ?? previous.kind,
      arguments: event.arguments === "{}" ? previous.arguments : event.arguments,
    };
  }

  /** Record a tool result; a non-terminal status never displaces a terminal one. */
  private appendResult(event: Extract<HarnessTurnEvent, { type: "tool-result" }>,): void {
    const index = this.results.findIndex((result,) => result.toolCallId === event.toolCallId);
    if (index === -1) {
      this.results.push({
        toolCallId: event.toolCallId,
        name: event.name ?? this.nameForCall(event.toolCallId,),
        status: event.status,
        content: event.content,
        error: event.error,
      },);

      return;
    }

    const previous = this.results[index]!;
    if (isTerminalToolStatus(previous.status,) && !isTerminalToolStatus(event.status,)) { return; }
    this.results[index] = {
      toolCallId: event.toolCallId,
      name: event.name ?? previous.name,
      status: event.status,
      content: event.content,
      error: event.error,
    };
  }

  /** The tool name remembered for a call, when the result omitted it. */
  private nameForCall(toolCallId: string,): string | null {
    return this.calls.find((call,) => call.id === toolCallId)?.name ?? null;
  }
}
