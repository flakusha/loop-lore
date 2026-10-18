// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer dispatch composed with provider failover: the single-retry rule, the
 * discard-partial-output rule, and an unchanged local path.
 */
import { describe, expect, test, } from "bun:test";
import {
  CancelReason,
  CancelSource,
  PeerAuthMode,
  PeerInstanceKind,
  PeerLinkKind,
  PeerWorkloadClass,
} from "../db/enums";
import { GenerationCancelledError, } from "../generation/cancellation-actions/error";
import { type ChunkEvent, type GenerateResponse, } from "../generation/providers/types";
import {
  dispatchPeerWorkload,
  PeerWorkExhaustedError,
  PeerWorkPartialOutputError,
} from "./peer-dispatch";
import { type PeerRouteDecision, PeerRouteReason, } from "./peer-router";
import { type PeerWorkAttempt, } from "./peer-work-client";
import { type PeerWorkRunRequest, } from "./peer-work-wire";

type RunPeerSeam = NonNullable<Parameters<typeof dispatchPeerWorkload>[0]["runPeer"]>;

/** This instance's own origin — the identity a receiver authorizes. */
const CALLER = "https://business.example";

const ORIGIN_A = "https://gpu-a.example";
const ORIGIN_B = "https://gpu-b.example";

const RESPONSE: GenerateResponse = {
  content: "assembled reply",
  finishReason: "stop",
  usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7, },
};

function peerDecision(origin: string = ORIGIN_A,): PeerRouteDecision {
  return {
    target: "peer",
    peer: {
      origin,
      state: "trusted",
      displayName: null,
      instanceKind: PeerInstanceKind.Assistant,
      authMode: PeerAuthMode.Tls,
      linkKind: PeerLinkKind.Remote,
      workloadTrust: true,
      allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
      advertisedWorkloadClasses: [PeerWorkloadClass.Chat,],
      stickyEnabled: true,
      hasSharedToken: false,
      capacityBytes: null,
    },
    assignmentKey: "opaque-handle-1234",
    reason: PeerRouteReason.Ranked,
  };
}

function localDecision(reason: PeerRouteReason,): PeerRouteDecision {
  return { target: "local", reason, };
}

function wireRequest(): PeerWorkRunRequest {
  return {
    workloadClass: PeerWorkloadClass.Chat,
    assignmentKey: "opaque-handle-1234",
    provider: "local-llm",
    model: "test-model",
    messages: [{ role: "user", content: "hello", },],
  };
}

describe("dispatchPeerWorkload - local decisions", () => {
  test("a local decision runs the local path and never touches a peer", async () => {
    let peerCalls = 0;
    let localCalls = 0;

    const result = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: localDecision(PeerRouteReason.FederationDisabled,),
      request: wireRequest(),
      local: () => {
        localCalls += 1;
        return Promise.resolve(RESPONSE,);
      },
      runPeer: (() => {
        peerCalls += 1;
        return Promise.resolve(
          {
            ok: false,
            emitted: 0,
            failure: { code: "protocol", status: 0, message: "x", chunks: [], },
          } as PeerWorkAttempt,
        );
      }) as RunPeerSeam,
    },);

    expect(result,).toBe(RESPONSE,);
    expect(localCalls,).toBe(1,);
    expect(peerCalls,).toBe(0,);
  });

  test("no eligible peer and no matrix row both reach the local path unchanged", async () => {
    for (const reason of [PeerRouteReason.NoEligiblePeer, PeerRouteReason.NoMatrixRow,]) {
      let localCalls = 0;
      const result = await dispatchPeerWorkload({
        callerOrigin: CALLER,
        decision: localDecision(reason,),
        request: wireRequest(),
        local: () => {
          localCalls += 1;
          return Promise.resolve(RESPONSE,);
        },
      },);

      expect(result,).toBe(RESPONSE,);
      expect(localCalls,).toBe(1,);
    }
  });

  test("a local failure with no peer attempt propagates unchanged, not wrapped", async () => {
    const boom = new GenerationCancelledError(
      CancelReason.UserCancel,
      CancelSource.User,
      "user stopped the generation",
    );

    const thrown = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: localDecision(PeerRouteReason.NoMatrixRow,),
      request: wireRequest(),
      local: () => Promise.reject(boom,),
    },).catch((error: unknown,) => error);

    expect(thrown,).toBe(boom,);
  });
});

describe("dispatchPeerWorkload - peer success", () => {
  test("the peer's response is returned and the local path is never entered", async () => {
    let localCalls = 0;
    const chunks: ChunkEvent[] = [];

    const result = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: () => {
        localCalls += 1;
        return Promise.resolve(RESPONSE,);
      },
      onChunk: (chunk,) => chunks.push(chunk,),
      runPeer: (async ({ onChunk, },) => {
        onChunk?.({ type: "content", content: "peer ", },);
        onChunk?.({ type: "content", content: "reply", },);
        return { ok: true, response: RESPONSE, };
      }) as RunPeerSeam,
    },);

    expect(result,).toBe(RESPONSE,);
    expect(localCalls,).toBe(0,);
    expect(chunks.map((chunk,) => chunk.content),).toEqual(["peer ", "reply",],);
  });

  test("the peer receives the assignment key the router pinned", async () => {
    const seen: { origin?: string; assignmentKey?: string } = {};

    await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(ORIGIN_B,),
      request: wireRequest(),
      local: () => Promise.resolve(RESPONSE,),
      runPeer: (async ({ peer, request, },) => {
        seen.origin = peer.origin;
        seen.assignmentKey = request.assignmentKey;
        return { ok: true, response: RESPONSE, };
      }) as RunPeerSeam,
    },);

    expect(seen.origin,).toBe(ORIGIN_B,);
    expect(seen.assignmentKey,).toBe("opaque-handle-1234",);
  });
});

describe("dispatchPeerWorkload - one retry across the boundary", () => {
  test("a peer failure with nothing emitted retries local exactly once", async () => {
    let localCalls = 0;
    let peerCalls = 0;

    const result = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: () => {
        localCalls += 1;
        return Promise.resolve(RESPONSE,);
      },
      runPeer: (async () => {
        peerCalls += 1;
        return {
          ok: false,
          emitted: 0,
          failure: { code: "protocol", status: 502, message: "peer down", chunks: [], },
        };
      }) as RunPeerSeam,
    },);

    expect(result,).toBe(RESPONSE,);
    expect(localCalls,).toBe(1,);
    expect(peerCalls,).toBe(1,);
  });

  test("a failing local retry does not trigger a second peer attempt", async () => {
    let localCalls = 0;
    let peerCalls = 0;

    const thrown = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: () => {
        localCalls += 1;
        return Promise.reject(new Error("local provider down",),);
      },
      runPeer: (async () => {
        peerCalls += 1;
        return {
          ok: false,
          emitted: 0,
          failure: { code: "protocol", status: 502, message: "peer down", chunks: [], },
        };
      }) as RunPeerSeam,
    },).catch((error: unknown,) => error);

    expect(thrown,).toBeInstanceOf(PeerWorkExhaustedError,);
    expect(localCalls,).toBe(1,);
    expect(peerCalls,).toBe(1,);
  });

  test("the exhausted error preserves the peer failure as its cause", async () => {
    const thrown = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(ORIGIN_B,),
      request: wireRequest(),
      local: () => Promise.reject(new Error("local provider down",),),
      runPeer: (async () => ({
        ok: false,
        emitted: 0,
        failure: { code: "unreachable", status: 0, message: "peer down", chunks: [], } as never,
      })) as never,
    },).catch((error: unknown,) => error);

    expect(thrown,).toBeInstanceOf(PeerWorkExhaustedError,);
    const cause = (thrown as PeerWorkExhaustedError).cause as { peer: { message: string } };
    expect(cause.peer.message,).toBe("peer down",);
  });
});

describe("dispatchPeerWorkload - partial output is discarded, never merged", () => {
  test("a peer that fails after streaming reports failure instead of retrying local", async () => {
    let localCalls = 0;
    const chunks: ChunkEvent[] = [];

    const thrown = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: () => {
        localCalls += 1;
        return Promise.resolve(RESPONSE,);
      },
      onChunk: (chunk,) => chunks.push(chunk,),
      runPeer: (async ({ onChunk, },) => {
        onChunk?.({ type: "content", content: "half a ", },);
        return { ok: false, emitted: 1, failure: { code: "protocol", status: 0, message: "peer died", chunks: [], }, };
      }) as RunPeerSeam,
    },).catch((error: unknown,) => error);

    expect(thrown,).toBeInstanceOf(PeerWorkPartialOutputError,);
    expect(localCalls,).toBe(0,);
    expect(chunks,).toHaveLength(1,);
    expect(chunks[0]?.content,).toBe("half a ",);
  });

  test("the discarded prefix is never concatenated with the local reply", async () => {
    let delivered = "";
    let localCalled = false;

    const thrown = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: () => {
        localCalled = true;
        return Promise.resolve({ ...RESPONSE, content: "the whole reply", },);
      },
      onChunk: (chunk,) => {
        delivered += chunk.type === "content" ? chunk.content : "";
      },
      runPeer: (async ({ onChunk, },) => {
        onChunk?.({ type: "content", content: "half a ", },);
        return { ok: false, emitted: 1, failure: { code: "protocol", status: 0, message: "peer died", chunks: [], }, };
      }) as RunPeerSeam,
    },).catch((error: unknown,) => error);

    expect(thrown,).toBeInstanceOf(PeerWorkPartialOutputError,);
    expect(localCalled,).toBe(false,);
    expect(delivered,).not.toContain("the whole reply",);
  });

  test("a caller cancellation is rethrown, never retried around", async () => {
    const controller = new AbortController();
    const cancelled = new GenerationCancelledError(
      CancelReason.UserCancel,
      CancelSource.User,
      "user stopped the generation",
    );

    let localCalls = 0;
    let peerCalls = 0;

    const pending = dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: () => {
        localCalls += 1;
        return Promise.resolve(RESPONSE,);
      },
      signal: controller.signal,
      runPeer: (async () => {
        peerCalls += 1;
        controller.abort(cancelled,);
        return { ok: false, emitted: 0, failure: { code: "protocol", status: 0, message: "peer died", chunks: [], }, };
      }) as RunPeerSeam,
    },);

    const thrown = await pending.catch((error: unknown,) => error);

    expect(thrown,).toBe(cancelled,);
    expect(localCalls,).toBe(0,);
    expect(peerCalls,).toBe(1,);
  });
});

describe("dispatchPeerWorkload - composed with provider failover", () => {
  test("the local retry runs through the caller's scheduler thunk, not a peer list", async () => {
    const scheduled: string[] = [];
    const localPath = (name: string,) => (): Promise<GenerateResponse> => {
      scheduled.push(name,);
      return Promise.resolve(RESPONSE,);
    };

    const first = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: localDecision(PeerRouteReason.FederationDisabled,),
      request: wireRequest(),
      local: localPath("scheduled",),
    },);

    expect(first,).toBe(RESPONSE,);

    const second = await dispatchPeerWorkload({
      callerOrigin: CALLER,
      decision: peerDecision(),
      request: wireRequest(),
      local: localPath("scheduled-after-peer",),
      runPeer: (async () => ({
        ok: false,
        emitted: 0,
        failure: { code: "protocol", status: 0, message: "x", chunks: [], },
      })) as never,
    },);

    expect(second,).toBe(RESPONSE,);
    expect(scheduled,).toEqual(["scheduled", "scheduled-after-peer",],);
  });
});
