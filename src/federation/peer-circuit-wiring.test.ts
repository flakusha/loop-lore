// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Negative-path wiring: a resolved peer failure must trip the circuit, a
 * resync miss must record a failure, and an ingested budget must produce a
 * finite headroom. Each test owns its DB and keys health state by a unique
 * origin, so the file is safe under parallel execution.
 */
import { describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import {
  CancelReason,
  CancelSource,
  PeerAuthMode,
  PeerBudgetMode,
  PeerInstanceKind,
  PeerLinkKind,
  PeerWorkloadClass,
} from "../db/enums";
import { GenerationCancelledError, } from "../generation/cancellation-actions/error";
import { type GenerateResponse, } from "../generation/providers/types";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { runResyncPass, touchPeer, upsertPeer, } from "./coordinator";
import { dispatchPeerWorkload, } from "./peer-dispatch";
import { peerCircuitOpen, peerLoad, } from "./peer-health";
import { type WorkloadPeer, } from "./peer-registry";
import {
  type PeerRouteDecision,
  type PeerRouteInput,
  PeerRouteReason,
  resolvePeerRoute,
} from "./peer-router";
import { type PeerWorkAttempt, } from "./peer-work-client";
import type { PeerWorkRunRequest, } from "./peer-work-wire";
import { writePerformanceBudget, } from "./performance-quota-write";

type PeerSeam = NonNullable<Parameters<typeof dispatchPeerWorkload>[0]["runPeer"]>;

const CALLER = "https://caller.example";
const RESPONSE: GenerateResponse = {
  content: "local reply",
  finishReason: "stop",
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
};

function uniqueOrigin(): string {
  return `https://${randomUUID()}.example`;
}

function failedAttempt(): PeerWorkAttempt {
  return {
    ok: false,
    emitted: 0,
    failure: { code: "transport", status: 502, message: "peer down", },
  };
}

/** What `runPeerWorkload` resolves when the caller signal aborts in flight. */
function abortedAttempt(): PeerWorkAttempt {
  return {
    ok: false,
    emitted: 0,
    failure: { code: "aborted", status: 0, message: "aborted", },
  };
}

function request(): PeerWorkRunRequest {
  return {
    workloadClass: PeerWorkloadClass.Chat,
    assignmentKey: "opaque-handle",
    provider: "local-llm",
    model: "test-model",
    messages: [{ role: "user", content: "hello", },],
  };
}

function routeInput(origin: string,): PeerRouteInput {
  const peer: WorkloadPeer = {
    origin,
    state: "trusted",
    displayName: null,
    instanceKind: PeerInstanceKind.General,
    authMode: PeerAuthMode.Tls,
    linkKind: PeerLinkKind.Remote,
    workloadTrust: true,
    stickyEnabled: true,
    allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    advertisedWorkloadClasses: [PeerWorkloadClass.Chat,],
    hasSharedToken: false,
    capacityBytes: null,
  };

  return {
    federationEnabled: true,
    workloadClass: PeerWorkloadClass.Chat,
    peers: [peer,],
    matrix: { preferences: { [PeerWorkloadClass.Chat]: [origin,], }, },
  };
}

describe("peer circuit wiring", () => {
  test("a returned failed attempt trips the circuit and excludes the peer next route", async () => {
    const origin = uniqueOrigin();
    const decision: PeerRouteDecision = {
      target: "peer",
      peer: routeInput(origin,).peers[0]!,
      assignmentKey: "opaque-handle",
      reason: PeerRouteReason.Ranked,
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await dispatchPeerWorkload({
        callerOrigin: CALLER,
        decision,
        request: request(),
        local: () => Promise.resolve(RESPONSE,),
        runPeer: (() => Promise.resolve(failedAttempt(),)) as NonNullable<
          Parameters<typeof dispatchPeerWorkload>[0]["runPeer"]
        >,
      },);

      expect(result,).toBe(RESPONSE,);
    }

    expect(peerCircuitOpen({ origin, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);
    const routed = resolvePeerRoute(routeInput(origin,),);
    expect(routed.target,).toBe("local",);
    expect(routed.excluded,).toContainEqual({ origin, reason: "circuit-open", },);
  });

  test("a failed trusted-peer resync records a health miss", async () => {
    const fixture = await createTestDb();
    const origin = uniqueOrigin();
    try {
      await upsertPeer(fixture.db, {
        origin,
        state: "trusted",
        capabilities: [PeerWorkloadClass.Chat,],
      },);

      for (let pass = 0; pass < 3; pass += 1) {
        await runResyncPass(fixture.db, {
          fetchImpl: async (url,) =>
            url.startsWith(origin,)
              ? { ok: false, status: 502, body: null, }
              : { ok: true, status: 200, body: {}, },
        },);
      }

      expect(peerCircuitOpen({ origin, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);
    } finally {
      await destroyTestDb(fixture,);
    }
  });

  test("an ingested performance budget gives the peer finite headroom", async () => {
    const fixture = await createTestDb();
    const origin = uniqueOrigin();
    try {
      await upsertPeer(fixture.db, { origin, state: "trusted", },);
      await writePerformanceBudget({
        database: fixture.db,
        input: {
          origin,
          workloadClass: PeerWorkloadClass.Chat,
          mode: PeerBudgetMode.Advisory,
          maxConcurrency: 4,
          maxQueueDepth: null,
          requestsPerMinute: null,
          tokensPerMinute: null,
        },
      },);

      await touchPeer(fixture.db, origin, {
        capabilities: [PeerWorkloadClass.Chat,],
        capacityBytes: 1024,
      },);

      const load = peerLoad({ origin, workloadClass: PeerWorkloadClass.Chat, },);
      expect(load.maxConcurrency,).toBe(4,);
      expect(load.headroom,).toBe(4,);
    } finally {
      await destroyTestDb(fixture,);
    }
  });

  test("caller cancellation does not trip the circuit, a real failure still does", async () => {
    const origin = uniqueOrigin();
    const decision: PeerRouteDecision = {
      target: "peer",
      peer: routeInput(origin,).peers[0]!,
      assignmentKey: "opaque-handle",
      reason: PeerRouteReason.Ranked,
    };

    const cancellation = new GenerationCancelledError(
      CancelReason.UserCancel,
      CancelSource.User,
      "user stopped the generation",
    );

    const controller = new AbortController();

    const dispatch = (runPeer: PeerSeam, signal?: AbortSignal,) =>
      dispatchPeerWorkload({
        callerOrigin: CALLER,
        decision,
        request: request(),
        local: () => Promise.resolve(RESPONSE,),
        runPeer,
        ...(signal === undefined ? {} : { signal, }),
      },);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const thrown = await dispatch(
        (() => {
          controller.abort(cancellation,);
          return Promise.resolve(abortedAttempt(),);
        }) as PeerSeam,
        controller.signal,
      ).catch((error: unknown,) => error);

      expect(thrown,).toBe(cancellation,);
    }

    expect(peerCircuitOpen({ origin, workloadClass: PeerWorkloadClass.Chat, },),).toBe(false,);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await dispatch((() => Promise.resolve(failedAttempt(),)) as PeerSeam,);
    }

    expect(peerCircuitOpen({ origin, workloadClass: PeerWorkloadClass.Chat, },),).toBe(true,);
  });
});
