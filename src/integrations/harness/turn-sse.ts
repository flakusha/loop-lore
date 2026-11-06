// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * turn-sse.ts — the harness turn transcript as SSE frames.
 *
 * Frames ride the chat's live stream buffer when one exists; with no live
 * buffer the persisted rows are the record (same contract as
 * `src/generation/auto-gen/job-status-bridge.ts`). Pushing is best-effort:
 * a failed push logs, it never fails the turn.
 */

import { getBuffer, } from "../../generation/stream-buffer";
import { getLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";
import { type HarnessTurnTranscript, } from "./turn-transcript";

/** One SSE frame: an event name and its one-line JSON body. */
export interface HarnessTurnFrame {
  /** SSE event name. */
  event: string;
  /** The frame body — one line of compact JSON. */
  line: string;
}

/**
 * The frames one turn's transcript maps to: assistant text, reasoning, tool
 * calls, tool results.
 * @param transcript - the collected turn
 * @returns the frames, in transcript order
 */
export function harnessTurnFrames(transcript: HarnessTurnTranscript,): HarnessTurnFrame[] {
  const frames: HarnessTurnFrame[] = [];
  if (transcript.text) {
    frames.push({ event: "harness-chunk", line: jsonStringifyOr({ text: transcript.text, },), },);
  }

  for (const thought of transcript.thinking) {
    frames.push({ event: "harness-thinking", line: jsonStringifyOr({ text: thought, },), },);
  }

  for (const call of transcript.toolCalls) {
    frames.push({
      event: "harness-tool-call",
      line: jsonStringifyOr({ toolCallId: call.id, name: call.name, kind: call.kind, },),
    },);
  }

  for (const result of transcript.toolResults) {
    frames.push({
      event: "harness-tool-result",
      line: jsonStringifyOr({
        toolCallId: result.toolCallId,
        status: result.status,
        toolError: result.error,
      },),
    },);
  }

  return frames;
}

/**
 * The turn-end frame: which row the turn produced and how it ended.
 * @param input
 * @returns the frame
 */
export function harnessTurnEndFrame(input: {
  messageId: string;
  stopReason: string;
  status: string;
},): HarnessTurnFrame {
  return {
    event: "harness-turn-end",
    line: jsonStringifyOr({
      messageId: input.messageId,
      stopReason: input.stopReason,
      status: input.status,
    },),
  };
}

/**
 * Push one frame onto the chat's live stream buffer. No buffer means no live
 * consumer — the frame is dropped (the rows carry the same information).
 * @param chatId - the chat whose buffer receives the frame
 * @param frame - the frame to push
 */
export function pushHarnessFrame(chatId: string, frame: HarnessTurnFrame,): void {
  const buffer = getBuffer(chatId,);
  if (!buffer) { return; }
  try {
    buffer.append(frame.event, frame.line,);
  } catch (error) {
    getLogger().child({ module: "harness-turn-sse", },).error(
      "harness turn SSE push failed",
      error instanceof Error ? error : undefined,
      { chatId, event: frame.event, },
    );
  }
}
