// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The peer workload wire codec: request parsing, chunk framing, and the
 * namespaced error codes a peer routes on.
 */
import { describe, expect, test, } from "bun:test";
import { type Config, } from "../config/schema";
import { PeerWorkloadClass, } from "../db/enums";
import { type ChunkEvent, } from "../generation/providers/types";
import { PEER_WORK_DEFAULT_TIMEOUT_MS, } from "./peer-work-client";
import { createLocalPeerWorkExecutor, } from "./peer-work-execute";
import {
  encodePeerWorkChunk,
  parsePeerWorkChunkLine,
  parsePeerWorkRunRequest,
  PEER_ORIGIN_HEADER,
  PEER_WORK_RUN_PATH,
  PEER_WORK_STREAM_TYPE,
  PeerWorkErrorCode,
  type PeerWorkRunRequest,
  readPeerWorkErrorCode,
} from "./peer-work-wire";

const EXECUTOR_CONFIG = { providers: [], } as unknown as Config;

function wireRequest(overrides: Partial<PeerWorkRunRequest> = {},): PeerWorkRunRequest {
  return {
    workloadClass: PeerWorkloadClass.Chat,
    assignmentKey: "opaque-handle-1234",
    provider: "local-llm",
    model: "test-model",
    messages: [{ role: "user", content: "hello", },],
    ...overrides,
  };
}

function body(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    workloadClass: PeerWorkloadClass.Chat,
    assignmentKey: "opaque-handle-1234",
    provider: "local-llm",
    model: "test-model",
    messages: [{ role: "user", content: "hello", },],
    ...overrides,
  };
}

describe("peer workload wire — protocol constants", () => {
  test("the run path, origin header, and stream type are the shared pair", () => {
    expect(PEER_WORK_RUN_PATH,).toBe("/api/peer-work/run",);
    expect(PEER_ORIGIN_HEADER,).toBe("x-peer-origin",);
    expect(PEER_WORK_STREAM_TYPE,).toContain("json",);
  });

  test("every error code is namespaced so a peer can route on it", () => {
    for (const code of Object.values(PeerWorkErrorCode,)) {
      expect(code.startsWith("federation.workload_",),).toBe(true,);
    }
  });

  test("the default per-attempt budget is finite and non-zero", () => {
    expect(PEER_WORK_DEFAULT_TIMEOUT_MS,).toBeGreaterThan(0,);
    expect(Number.isFinite(PEER_WORK_DEFAULT_TIMEOUT_MS,),).toBe(true,);
  });
});

describe("peer workload wire — request parsing", () => {
  test("a minimal request round-trips through the parser", () => {
    const parsed = parsePeerWorkRunRequest(body(),);

    expect(parsed?.workloadClass,).toBe(PeerWorkloadClass.Chat,);
    expect(parsed?.assignmentKey,).toBe("opaque-handle-1234",);
    expect(parsed?.messages,).toEqual([{ role: "user", content: "hello", },],);
  });

  test("sampling params are kept only when the wire actually carried them", () => {
    expect(parsePeerWorkRunRequest(body({ params: {}, },),)?.params,).toBeUndefined();
    expect(
      parsePeerWorkRunRequest(body({ params: { temperature: 0.2, maxTokens: 32, }, },),)?.params,
    ).toEqual({ temperature: 0.2, maxTokens: 32, },);

    expect(parsePeerWorkRunRequest(body({ params: { topP: 0.9, }, },),)?.params,).toBeUndefined();
  });

  test("a non-object body is rejected", () => {
    expect(parsePeerWorkRunRequest("nope",),).toBeNull();
  });

  test("a body missing a required field is rejected", () => {
    expect(parsePeerWorkRunRequest(body({ workloadClass: undefined, },),),).toBeNull();
    expect(parsePeerWorkRunRequest(body({ provider: 7, },),),).toBeNull();
    expect(parsePeerWorkRunRequest(body({ model: null, },),),).toBeNull();
    expect(parsePeerWorkRunRequest(body({ assignmentKey: undefined, },),),).toBeNull();
    expect(parsePeerWorkRunRequest(body({ messages: "hi", },),),).toBeNull();
  });

  test("a message with an unknown role or a non-string body is rejected", () => {
    expect(parsePeerWorkRunRequest(body({ messages: [{ role: "root", content: "x", },], },),),).toBeNull();
    expect(parsePeerWorkRunRequest(body({ messages: [{ role: "user", content: 5, },], },),),).toBeNull();
  });
});

describe("peer workload wire — chunk framing", () => {
  test("each chunk type survives an encode/parse round-trip", () => {
    const chunks: ChunkEvent[] = [
      { type: "content", content: "he", },
      { type: "thinking", content: "hmm", },
      { type: "tool_call", toolCall: { type: "function", id: "t1", function: { name: "search", arguments: "{}", }, }, },
      { type: "done", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, }, },
      { type: "error", },
    ];

    for (const chunk of chunks) {
      const line = encodePeerWorkChunk(chunk,);
      expect(line, `${chunk.type} must frame`,).not.toBeNull();
      expect(line?.endsWith("\n",),).toBe(true,);
      expect(parsePeerWorkChunkLine(line!.trim(),),).toEqual(chunk,);
    }
  });

  test("an empty content delta still frames, so a peer can emit one", () => {
    expect(encodePeerWorkChunk({ type: "content", content: "", },),).toBe('{"type":"content","content":""}\n',);
  });

  test("a malformed line is reported as null rather than trusted", () => {
    expect(parsePeerWorkChunkLine("not json",),).toBeNull();
    expect(parsePeerWorkChunkLine('{"type":"nonsense"}',),).toBeNull();
    expect(parsePeerWorkChunkLine("",),).toBeNull();
  });
});

describe("peer workload wire — error codes", () => {
  test("the namespaced code is read out of the envelope's data block", () => {
    const envelope = { error: "nope", code: "FORBIDDEN", data: { error_code: PeerWorkErrorCode.PeerUntrusted, }, };

    expect(readPeerWorkErrorCode(envelope,),).toBe("federation.workload_peer_untrusted",);
  });

  test("an envelope without a namespaced code yields null", () => {
    expect(readPeerWorkErrorCode({ error: "nope", code: "FORBIDDEN", data: {}, },),).toBeNull();
    expect(readPeerWorkErrorCode({ error: "nope", },),).toBeNull();
    expect(readPeerWorkErrorCode("not json",),).toBeNull();
  });
});

describe("createLocalPeerWorkExecutor — the receiver's own provider chain", () => {
  test("a peer naming an unknown provider profile is refused, not faked", async () => {
    const executor = createLocalPeerWorkExecutor({ config: EXECUTOR_CONFIG, },);

    const thrown = await executor.run({
      request: wireRequest({ provider: "no-such-profile", },),
      onChunk: () => {},
      signal: new AbortController().signal,
    },).catch((error: unknown,) => error);

    expect(thrown,).toBeInstanceOf(Error,);
    expect((thrown as Error).message,).toContain("no local provider resolved",);
  });
});
