// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Harness turn SSE tests: the frames a transcript maps to and how they reach
 * a live chat buffer.
 *
 * Resource contract: no child process, no database, no ports. The one global
 * it touches (the per-chat stream buffer) is created and removed by the test
 * that uses it.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { getOrCreateBuffer, removeBuffer, } from "../../generation/stream-buffer";
import { harnessTurnEndFrame, harnessTurnFrames, pushHarnessFrame, } from "./turn-sse";
import { type HarnessTurnTranscript, } from "./turn-transcript";

const chatId = "chat-harness-sse";

/** A transcript with one of everything. */
function transcript(): HarnessTurnTranscript {
  return {
    text: "the answer",
    thinking: ["a thought",],
    toolCalls: [{ id: "tc-1", name: "grep", kind: "read", arguments: "{}", },],
    toolResults: [{ toolCallId: "tc-1", name: "grep", status: "completed", content: "ok", error: false, },],
  };
}

afterEach(() => {
  removeBuffer(chatId,);
},);

describe("harnessTurnFrames", () => {
  it("maps every transcript part to its own frame", () => {
    const frames = harnessTurnFrames(transcript(),);

    expect(frames.map((frame,) => frame.event),).toEqual([
      "harness-chunk",
      "harness-thinking",
      "harness-tool-call",
      "harness-tool-result",
    ],);

    expect(frames[0]!.line,).toBe(JSON.stringify({ text: "the answer", },),);
    expect(JSON.parse(frames[2]!.line,),).toEqual({ toolCallId: "tc-1", name: "grep", kind: "read", },);
    expect(JSON.parse(frames[3]!.line,),).toEqual({ toolCallId: "tc-1", status: "completed", toolError: false, },);
  });

  it("skips an empty transcript", () => {
    const frames = harnessTurnFrames({ text: "", thinking: [], toolCalls: [], toolResults: [], },);

    expect(frames,).toEqual([],);
  });

  it("builds the turn-end frame from the persisted row", () => {
    const frame = harnessTurnEndFrame({ messageId: "msg-1", stopReason: "end_turn", status: "confirmed", },);

    expect(frame.event,).toBe("harness-turn-end",);
    expect(JSON.parse(frame.line,),).toEqual({ messageId: "msg-1", stopReason: "end_turn", status: "confirmed", },);
  });
});

describe("pushHarnessFrame", () => {
  it("pushes onto the live chat buffer", () => {
    const buffer = getOrCreateBuffer(chatId,);
    const line = JSON.stringify({ text: "hi", },);

    pushHarnessFrame(chatId, { event: "harness-chunk", line, },);

    const events = buffer.replay();
    expect(events,).toHaveLength(1,);
    expect(events[0]!.type,).toBe("harness-chunk",);
    expect(events[0]!.html,).toBe(line,);
  });

  it("drops the frame when no live buffer exists", () => {
    expect(() => {
      pushHarnessFrame(chatId, { event: "harness-chunk", line: "{}", },);
    },).not.toThrow();
  });
});
