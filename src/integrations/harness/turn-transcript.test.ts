// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * Turn transcript tests: the per-turn collector that folds narrowed ACP
 * events into one transcript.
 *
 * Resource contract: pure — no child process, no database, no ports, no
 * module state; every case builds its own collector.
 */
import { describe, expect, it, } from "bun:test";
import { emptyTurnTranscript, TurnTranscriptCollector, } from "./turn-transcript";

describe("TurnTranscriptCollector", () => {
  it("concatenates text and keeps reasoning in arrival order", () => {
    const collector = new TurnTranscriptCollector();
    collector.append({ type: "text", text: "he", },);
    collector.append({ type: "thinking", text: "first", },);
    collector.append({ type: "text", text: "llo", },);
    collector.append({ type: "thinking", text: "second", },);

    const transcript = collector.snapshot();

    expect(transcript.text,).toBe("hello",);
    expect(transcript.thinking,).toEqual(["first", "second",],);
  });

  it("keeps one entry per tool call id and remembers the call's name for its result", () => {
    const collector = new TurnTranscriptCollector();
    collector.append({ type: "tool-call", toolCallId: "tc-1", name: "grep", kind: "read", arguments: "{}", },);
    collector.append({ type: "tool-call", toolCallId: "tc-1", name: "grep", kind: "read", arguments: '{"q":1}', },);
    collector.append({
      type: "tool-result",
      toolCallId: "tc-1",
      name: null,
      status: "completed",
      content: "ok",
      error: false,
    },);

    const transcript = collector.snapshot();

    expect(transcript.toolCalls,).toHaveLength(1,);
    expect(transcript.toolCalls[0]!.arguments,).toBe('{"q":1}',);
    expect(transcript.toolResults[0]!.name,).toBe("grep",);
  });

  it("never lets a non-terminal update displace a finished result", () => {
    const collector = new TurnTranscriptCollector();
    collector.append({
      type: "tool-result",
      toolCallId: "tc-1",
      name: "grep",
      status: "completed",
      content: "ok",
      error: false,
    },);

    collector.append({
      type: "tool-result",
      toolCallId: "tc-1",
      name: "grep",
      status: "in_progress",
      content: "still",
      error: false,
    },);

    const transcript = collector.snapshot();

    expect(transcript.toolResults,).toHaveLength(1,);
    expect(transcript.toolResults[0]!.status,).toBe("completed",);
    expect(transcript.toolResults[0]!.content,).toBe("ok",);
  });

  it("keeps the first-seen order of tool calls", () => {
    const collector = new TurnTranscriptCollector();
    collector.append({ type: "tool-call", toolCallId: "tc-1", name: "a", kind: null, arguments: "{}", },);
    collector.append({ type: "tool-call", toolCallId: "tc-2", name: "b", kind: null, arguments: "{}", },);
    collector.append({ type: "tool-call", toolCallId: "tc-1", name: "a", kind: null, arguments: "{}", },);

    const transcript = collector.snapshot();

    expect(transcript.toolCalls.map((call,) => call.id),).toEqual(["tc-1", "tc-2",],);
  });

  it("matches the empty transcript when the collector saw no events", () => {
    expect(new TurnTranscriptCollector().snapshot(),).toEqual(emptyTurnTranscript(),);
    expect(emptyTurnTranscript().text,).toBe("",);
  });
});
