// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E: Federated workload offload across TWO real loop-lore instances.
 *
 * A "business" instance (the caller) and a dedicated rpg/assistant instance
 * (the peer) are each booted as their own `federationRoutes` Elysia app on
 * `Bun.serve` over an ephemeral port, each with its own migrated SQLite DB.
 * The peer serves the work from its REAL `/api/peer-work/run` handler across a
 * REAL socket — the transport is `runPeerWorkload`'s default `safeFetch`, not
 * an injected stub — and every claim is asserted against a database AFTER the
 * call rather than against a mock.
 *
 * The peer runs `createLocalPeerWorkExecutor`, the production receiver: it
 * resolves the requested provider profile through its OWN registry and
 * `buildFailoverList`, then dispatches through `scheduledCallWithFailover`.
 * Only the LLM provider itself is a local double — which is exactly what the
 * `PeerWorkExecutor` injection seam exists for; everything above it is
 * production code.
 *
 * FIDELITY LIMITATION, stated rather than hidden: both instances live in one
 * process, so they share the process-global singletons the workload plane uses
 * (the provider registry, `peer-health` circuits, `performance-quota` counters,
 * the scheduler manager). What is genuinely per-instance — and what this spec
 * proves — is the HTTP boundary and the database: two ports, two DBs, two
 * independently configured route mounts. `beforeEach`/`afterEach` reset the
 * shared state so nothing leaks between cases or into other suites.
 *
 * Composition under test, end to end:
 *   mesh_peers registry + system_config matrix
 *     -> resolvePeerRoute()            pure routing policy
 *     -> dispatchPeerWorkload()       local/remote boundary, retry-once
 *     -> runPeerWorkload()            real HTTP to the peer
 *     -> POST /api/peer-work/run      real route on the peer instance
 *     -> authorizePeerWork()          the inbound trust chain
 *     -> scheduledCallWithFailover()  the peer's own provider chain
 */

import type { Config, FederationConfig, } from "@/config/schema";
import type { Db, } from "@/db";
import { PeerAuthMode, PeerBudgetMode, PeerInstanceKind, PeerWorkloadClass, } from "@/db/enums";
import { setPeerState, upsertPeer, } from "@/federation/coordinator";
import { readAssignmentMatrix, writeAssignmentMatrix, } from "@/federation/peer-assignment-matrix";
import { dispatchPeerWorkload, PeerWorkPartialOutputError, } from "@/federation/peer-dispatch";
import { resetPeerHealth, } from "@/federation/peer-health";
import { listWorkloadPeers, savePeerWorkload, } from "@/federation/peer-registry";
import type { PeerRouteDecision, } from "@/federation/peer-router";
import { resolvePeerRoute, } from "@/federation/peer-router";
import { pinWorkloadPeer, readWorkAssignment, releaseWorkAssignment, } from "@/federation/peer-work-assignments";
import type { PeerWorkRunRequest, } from "@/federation/peer-work-wire";
import { PEER_WORK_RUN_PATH, readPeerWorkErrorCode, } from "@/federation/peer-work-wire";
import { resetPerformanceQuota, } from "@/federation/performance-quota";
import { admitPeerWork, FederationQuotaErrorCode, } from "@/federation/performance-quota-guard";
import { reloadPerformanceQuota, } from "@/federation/performance-quota-store";
import { writePerformanceBudget, } from "@/federation/performance-quota-write";
import { registerProvider, unregisterProvider, } from "@/generation/providers/registry";
import type {
  ChunkEvent,
  GenerateRequest,
  GenerateResponse,
  ModelInfo,
  StreamHandler,
} from "@/generation/providers/types";
import { federationRoutes, } from "@/routes/federation";
import { createTestDb, destroyTestDb, } from "@/test-utils/create-test-db";
import { MockLLMProvider, } from "@/test-utils/mock-provider";
import { afterAll, afterEach, beforeEach, describe, expect, test, } from "bun:test";

const SECRET = "e2e-fed-secret-0123456789";
const PSK = "e2e-fed-psk";
const SHARED_TOKEN = "e2e-shared-workload-credential";
/** The provider profile the wire requests; the peer resolves it in its own registry. */
const PROVIDER = "peer-llm";

/** Every instance booted by the current test, so none can leak on a throw. */
const bootedInstances: Instance[] = [];

/** This file's original NO_PROXY, restored in afterAll. */
const originalNoProxy = process.env.NO_PROXY;

/** Every request the peer instance's LOCAL provider chain actually received. */
const peerProviderSaw: GenerateRequest[] = [];

/**
 * The peer's local LLM provider.
 *
 * Wraps the shared mock so the peer's real `scheduledCallWithFailover` path
 * runs, and records exactly what crossed the wire — which is what the
 * data-minimization assertion reads.
 */
class PeerProvider extends MockLLMProvider {
  /** Throw before emitting anything (fails BEFORE streaming). */
  failBeforeStream = false;
  /** Emit one chunk, then throw (fails AFTER streaming began). */
  failAfterStream = false;

  override stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    peerProviderSaw.push(req,);
    if (this.failBeforeStream) {
      return Promise.reject(new Error("peer provider died before streaming",),);
    }

    if (this.failAfterStream) {
      handler({ type: "content", content: "half an answer", },);
      return Promise.reject(new Error("peer provider died mid-generation",),);
    }

    return super.stream(req, handler,);
  }

  override listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([{ id: "peer-model", },],);
  }
}

let peerProvider: PeerProvider;

function instanceConfig(): Config {
  const federation: FederationConfig = {
    enabled: true,
    seeds: [],
    peers: [],
    meshPsk: PSK,
    duplication: { mode: "trusted", peers: [], },
    workloadOffload: { classes: [PeerWorkloadClass.Chat, PeerWorkloadClass.Embedding,], },
  };

  return {
    server: { host: "127.0.0.1", port: 0, tls: undefined, trustProxy: true, },
    auth: { registrationOpen: false, required: false, jwtSecret: "e2e-fed-jwt", },
    byoKey: { enabled: true, encryptionKey: SECRET, },
    generation: { defaultProvider: PROVIDER, defaultModels: { [PROVIDER]: "peer-model", }, },
    federation,
  } as unknown as Config;
}

/** One booted instance: a real app, a real ephemeral port, a real migrated DB. */
interface Instance {
  origin: string;
  db: Db;
  close: () => Promise<void>;
}

/**
 * Boot one real instance on an ephemeral loopback port with its own DB.
 *
 * `federationRoutes` is the production mount, so the peer serves work through
 * `createLocalPeerWorkExecutor` -> `scheduledCallWithFailover`, exactly as a
 * deployed peer would.
 */
async function instance(): Promise<Instance> {
  const fixture = await createTestDb();
  const config = instanceConfig();
  const app = federationRoutes({ config, database: fixture.db as Db, } as never,);
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request: Request,) => app.handle(request,),
  },);

  // Loopback fetches must not be proxied. Restored in afterAll — a mutated
  // NO_PROXY leaks into every suite that runs after this one.
  process.env.NO_PROXY = process.env.NO_PROXY
    ? `${process.env.NO_PROXY},127.0.0.1,localhost`
    : "127.0.0.1,localhost";

  const booted: Instance = {
    origin: `http://127.0.0.1:${server.port}`,
    db: fixture.db as Db,
    close: async () => {
      await server.stop(true,);
      await destroyTestDb(fixture,);
    },
  };

  // Every instance registers itself, so one thrown assertion cannot leak a
  // listening socket or an open SQLite handle into the rest of the run.
  bootedInstances.push(booted,);
  return booted;
}

/** Register the caller as a trusted, workload-trusting loopback peer. */
async function trustCallerOnPeer(
  peerDb: Db,
  callerOrigin: string,
  classes: readonly PeerWorkloadClass[],
): Promise<void> {
  await savePeerWorkload(peerDb, {
    origin: callerOrigin,
    encryptionKey: SECRET,
    displayName: "business instance",
    instanceKind: PeerInstanceKind.Business,
    authMode: PeerAuthMode.HostLocal,
    sharedToken: SHARED_TOKEN,
    workloadTrust: true,
    allowedWorkloadClasses: classes,
    stickyEnabled: true,
  },);

  await setPeerState(peerDb, callerOrigin, "trusted",);
}

/** A remote (TLS) caller's origin: the peer's registry keys on what it CLAIMS. */
const REMOTE_CALLER = "https://business.remote.example";

/** A second remote caller, so one peer's credential cannot open another's. */
const OTHER_REMOTE_CALLER = "https://other.remote.example";

/**
 * Register a remote (TLS) caller on the peer: trusted, workload-trusted, and
 * holding its own shared token. `auth_mode` derives to `tls` from the origin.
 */
async function trustRemoteCallerOnPeer(
  peerDb: Db,
  callerOrigin: string,
  token: string,
): Promise<void> {
  await savePeerWorkload(peerDb, {
    origin: callerOrigin,
    encryptionKey: SECRET,
    displayName: "remote business instance",
    authMode: PeerAuthMode.Tls,
    sharedToken: token,
    workloadTrust: true,
    allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
  },);

  await setPeerState(peerDb, callerOrigin, "trusted",);
}
/**
 * Register the peer as routable on the caller.
 *
 * `upsertPeer` records the classes the peer ADVERTISED: routing intersects
 * declared and observed, so a peer that never advertised a class is not
 * eligible for it.
 */
async function registerPeerOnCaller(
  callerDb: Db,
  peerOrigin: string,
  classes: readonly PeerWorkloadClass[],
): Promise<void> {
  await savePeerWorkload(callerDb, {
    origin: peerOrigin,
    encryptionKey: SECRET,
    displayName: "rpg assistant",
    instanceKind: PeerInstanceKind.Rpg,
    authMode: PeerAuthMode.HostLocal,
    sharedToken: SHARED_TOKEN,
    workloadTrust: true,
    allowedWorkloadClasses: classes,
    stickyEnabled: true,
  },);

  await upsertPeer(callerDb, { origin: peerOrigin, state: "trusted", capabilities: [...classes,], },);
}

/** Resolve a route the way a call site does: real peers, real matrix, real pin. */
async function routeFor(
  callerDb: Db,
  options: { workloadClass: PeerWorkloadClass; affinityKey?: string },
): Promise<PeerRouteDecision> {
  const assignment = options.affinityKey === undefined
    ? null
    : await readWorkAssignment(callerDb, {
      affinityKey: options.affinityKey,
      workloadClass: options.workloadClass,
    },);

  return resolvePeerRoute({
    federationEnabled: true,
    workloadClass: options.workloadClass,
    ...(options.affinityKey === undefined ? {} : { affinityKey: options.affinityKey, }),
    peers: await listWorkloadPeers(callerDb,),
    matrix: await readAssignmentMatrix(callerDb,),
    assignment,
  },);
}

/** Read the namespaced `error_code` out of the error envelope a peer returned. */
async function errorCodeOf(response: Response,): Promise<string | null> {
  const body: unknown = await response.json();
  return readPeerWorkErrorCode(body,);
}

/** POST a wire request straight at an instance's real endpoint. */
function postToPeer(
  peer: Instance,
  callerOrigin: string,
  body: unknown,
  bearer?: string,
): Promise<Response> {
  return fetch(`${peer.origin}${PEER_WORK_RUN_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-peer-origin": callerOrigin,
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}`, }),
    },
    body: JSON.stringify(body,),
  },);
}

/** The minimized wire request a call site would build for one chat turn. */
const CHAT_WIRE_REQUEST: PeerWorkRunRequest = {
  workloadClass: PeerWorkloadClass.Chat,
  assignmentKey: "opaque-assignment-handle",
  provider: PROVIDER,
  model: "peer-model",
  messages: [{ role: "user", content: "roll a perception check", },],
  params: { temperature: 0.4, maxTokens: 128, },
};

/** A local answer, for the caller's own path. */
const LOCAL_RESPONSE: GenerateResponse = {
  content: "local answer",
  finishReason: "stop",
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
};

describe("federation offload — two real instances", () => {
  let caller: Instance;
  let peer: Instance;

  beforeEach(async () => {
    bootedInstances.length = 0;
    resetPeerHealth();
    resetPerformanceQuota();
    peerProviderSaw.length = 0;
    peerProvider = new PeerProvider();
    registerProvider(PROVIDER, peerProvider,);
    caller = await instance();
    peer = await instance();
  }, 30_000,);

  // Close EVERY instance this test booted, not just the two it named. A test
  // that throws part-way through would otherwise leave a listening socket and
  // an open SQLite handle behind for every suite that runs after it.
  afterEach(async () => {
    resetPeerHealth();
    resetPerformanceQuota();
    unregisterProvider(PROVIDER,);
    for (const booted of bootedInstances.splice(0,)) {
      await booted.close();
    }
  }, 30_000,);

  afterAll(() => {
    if (originalNoProxy === undefined) {
      process.env.NO_PROXY = undefined;
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = originalNoProxy;
    }
  },);

  test("federation off by default: with no peer configured the wire is never touched", async () => {
    let localCalls = 0;
    let peerCalls = 0;

    // No peer row and no matrix row at all — the shipped default.
    const decision = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, },);
    expect(decision.target,).toBe("local",);

    const response = await dispatchPeerWorkload({
      callerOrigin: caller.origin,
      decision,
      request: CHAT_WIRE_REQUEST,
      local: () => {
        localCalls += 1;
        return Promise.resolve(LOCAL_RESPONSE,);
      },
      runPeer: () => {
        peerCalls += 1;
        return Promise.reject(new Error("the wire must not be touched with federation off",),);
      },
    },);

    expect(localCalls,).toBe(1,);
    expect(peerCalls,).toBe(0,);
    expect(response.content,).toBe("local answer",);
    // The peer instance ran nothing at all.
    expect(peerProviderSaw,).toEqual([],);
  });

  test("a registered loopback peer with trust, a class and a matrix row serves the work over HTTP", async () => {
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, peer.origin, [PeerWorkloadClass.Chat,],);
    await writeAssignmentMatrix({
      database: caller.db,
      matrix: { preferences: { chat: [peer.origin,], }, },
    },);

    const decision = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, },);
    expect(decision.target,).toBe("peer",);
    if (decision.target !== "peer") { throw new Error("expected a peer route",); }
    expect(decision.peer.origin,).toBe(peer.origin,);

    let localCalls = 0;
    const response = await dispatchPeerWorkload({
      callerOrigin: caller.origin,
      decision,
      request: CHAT_WIRE_REQUEST,
      bearer: SHARED_TOKEN,
      local: () => {
        localCalls += 1;
        return Promise.reject(new Error("local must not run when the peer serves the work",),);
      },
    },);

    expect(localCalls,).toBe(0,);
    // The peer's own executor STREAMS, so the assembled reply is what the
    // peer's local provider produced, not the caller's local answer.
    expect(response.content,).toBe("Mock streamed response",);
    expect(response.usage.totalTokens,).toBe(30,);

    // The peer's OWN provider chain actually ran the work.
    expect(peerProviderSaw,).toHaveLength(1,);

    // Read back from the PEER's DB after the call: it admitted exactly the
    // caller origin, for exactly the chat class.
    const admitted = await listWorkloadPeers(peer.db, "trusted",);
    expect(admitted.map((entry,) => entry.origin),).toContain(caller.origin,);
    expect(admitted[0]?.allowedWorkloadClasses,).toEqual([PeerWorkloadClass.Chat,],);
  });

  test("a wrong shared token is refused with the namespaced federation.workload_* code", async () => {
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);

    const response = await postToPeer(peer, caller.origin, CHAT_WIRE_REQUEST, "not-the-shared-token",);

    expect(response.status,).toBe(403,);
    expect(await errorCodeOf(response,),).toBe("federation.workload_credential_rejected",);
    // Refused BEFORE admission: no work ran on the peer.
    expect(peerProviderSaw,).toEqual([],);
  });

  // THE DEFECT THIS SPEC PINS: a remote (TLS) peer used to be admitted on the
  // strength of the caller-controlled `x-peer-origin` header alone, so anyone
  // who could reach the port and name a trusted origin got that peer's
  // workloads executed. TLS trust is an outbound layer, never the inbound
  // authentication: the per-peer shared token is required for every
  // workload-trusted peer, whatever its auth_kind.
  test("a remote workload-trusted peer with NO credential is refused and nothing runs", async () => {
    await trustRemoteCallerOnPeer(peer.db, REMOTE_CALLER, SHARED_TOKEN,);

    // The caller is trusted, workload-trusted and allows the chat class. It
    // presents the origin header and nothing else.
    const response = await postToPeer(peer, REMOTE_CALLER, CHAT_WIRE_REQUEST,);

    expect(response.status,).toBe(403,);
    expect(await errorCodeOf(response,),).toBe("federation.workload_credential_rejected",);
    // The peer's executor never ran: zero provider invocations, not a retry.
    expect(peerProviderSaw,).toEqual([],);
  });

  test("a remote workload-trusted peer is refused on a wrong token and admitted on its own", async () => {
    await trustRemoteCallerOnPeer(peer.db, REMOTE_CALLER, SHARED_TOKEN,);

    const wrong = await postToPeer(peer, REMOTE_CALLER, CHAT_WIRE_REQUEST, "not-the-shared-token",);
    expect(wrong.status,).toBe(403,);
    expect(await errorCodeOf(wrong,),).toBe("federation.workload_credential_rejected",);
    expect(peerProviderSaw,).toEqual([],);

    const right = await postToPeer(peer, REMOTE_CALLER, CHAT_WIRE_REQUEST, SHARED_TOKEN,);
    expect(right.status,).toBe(200,);
    expect(peerProviderSaw,).toHaveLength(1,);
  });

  test("a remote peer's token is refused when presented as a different remote peer", async () => {
    await trustRemoteCallerOnPeer(peer.db, REMOTE_CALLER, SHARED_TOKEN,);
    await trustRemoteCallerOnPeer(peer.db, OTHER_REMOTE_CALLER, "other-remote-credential",);

    const forged = await postToPeer(peer, OTHER_REMOTE_CALLER, CHAT_WIRE_REQUEST, SHARED_TOKEN,);
    expect(forged.status,).toBe(403,);
    expect(await errorCodeOf(forged,),).toBe("federation.workload_credential_rejected",);
    expect(peerProviderSaw,).toEqual([],);

    // The other peer's OWN token is admitted, so the refusal is the mismatch.
    const own = await postToPeer(peer, OTHER_REMOTE_CALLER, CHAT_WIRE_REQUEST, "other-remote-credential",);
    expect(own.status,).toBe(200,);
    expect(peerProviderSaw,).toHaveLength(1,);
  });

  test("a loopback peer is unchanged: no token refused, its own token admitted", async () => {
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);

    const bare = await postToPeer(peer, caller.origin, CHAT_WIRE_REQUEST,);
    expect(bare.status,).toBe(403,);
    expect(await errorCodeOf(bare,),).toBe("federation.workload_credential_rejected",);
    expect(peerProviderSaw,).toEqual([],);

    const admitted = await postToPeer(peer, caller.origin, CHAT_WIRE_REQUEST, SHARED_TOKEN,);
    expect(admitted.status,).toBe(200,);
    expect(peerProviderSaw,).toHaveLength(1,);
  });

  test("a class outside the peer's allowed_workload_classes is refused", async () => {
    // The peer allows chat; the caller asks for an embedding it never offered.
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);

    const response = await postToPeer(
      peer,
      caller.origin,
      { ...CHAT_WIRE_REQUEST, workloadClass: PeerWorkloadClass.Embedding, },
      SHARED_TOKEN,
    );

    expect(response.status,).toBe(403,);
    expect(await errorCodeOf(response,),).toBe("federation.workload_class_not_allowed",);
    expect(peerProviderSaw,).toEqual([],);
  });

  test("a trusted-origin peer that lacks workload_trust is refused", async () => {
    await savePeerWorkload(peer.db, {
      origin: caller.origin,
      encryptionKey: SECRET,
      authMode: PeerAuthMode.HostLocal,
      sharedToken: SHARED_TOKEN,
      workloadTrust: false,
      allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    },);

    // Content-replication trust granted; workload trust deliberately withheld.
    await setPeerState(peer.db, caller.origin, "trusted",);

    const response = await postToPeer(peer, caller.origin, CHAT_WIRE_REQUEST, SHARED_TOKEN,);

    expect(response.status,).toBe(403,);
    expect(await errorCodeOf(response,),).toBe("federation.workload_trust_required",);
    expect(peerProviderSaw,).toEqual([],);
  });

  test("a peer at its concurrency ceiling is refused; below the ceiling it is admitted", async () => {
    // An operator-set HARD budget on the RECEIVER, keyed by the caller's
    // origin — so the receiver must know the caller first.
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    // maxQueueDepth null = never queue, so the ceiling refuses immediately.
    await writePerformanceBudget({
      database: peer.db,
      input: {
        origin: caller.origin,
        workloadClass: PeerWorkloadClass.Chat,
        mode: PeerBudgetMode.Hard,
        maxConcurrency: 1,
        maxQueueDepth: null,
        requestsPerMinute: null,
        tokensPerMinute: null,
      },
    },);

    await reloadPerformanceQuota({ database: peer.db, enabled: true, },);

    const cell = { origin: caller.origin, workloadClass: PeerWorkloadClass.Chat, };
    let releaseHeld: (() => void) | undefined;
    const held = new Promise<void>((resolve,) => {
      releaseHeld = resolve;
    },);

    // The first call takes the only slot and holds it.
    const first = admitPeerWork({ ...cell, peerTrusted: true, }, () => held.then(() => "adopted"),);
    // The second arrives at the ceiling with nowhere to queue.
    const atCeiling = await admitPeerWork({ ...cell, peerTrusted: true, }, () => Promise.resolve("must not run",),);

    expect(atCeiling.admitted,).toBe(false,);
    if (atCeiling.admitted) { throw new Error("expected a refusal at the ceiling",); }
    expect(atCeiling.response.status,).toBe(429,);
    expect(atCeiling.response.headers.get("retry-after",),).toBeTruthy();
    expect(await errorCodeOf(atCeiling.response,),).toBe(FederationQuotaErrorCode.QuotaExceeded,);
    const retryAfterSec = Number(atCeiling.response.headers.get("retry-after",),);

    // The executor above assigns this before `held` settles, so it is set by
    // now; assert it explicitly rather than narrowing away an assignment TS
    // cannot see through the promise constructor.
    if (!releaseHeld) { throw new Error("held release was never assigned",); }
    releaseHeld();
    expect((await first).admitted,).toBe(true,);

    // The slot is free, but the refusal above QUARANTINED the cell for its
    // retry-after window — a peer that just bounced callers is not re-admitted
    // on the next tick, it is told to back off. Advance past that window: the
    // quarantine is the designed behaviour, not a second refusal to tolerate.
    const afterRelease = await admitPeerWork(
      { ...cell, peerTrusted: true, now: Date.now() + retryAfterSec * 1000 + 1, },
      () => Promise.resolve("ok",),
    );

    expect(afterRelease.admitted,).toBe(true,);
  });

  test("a peer failing BEFORE streaming causes exactly one local retry", async () => {
    // The peer's local provider dies before emitting a chunk, so the real route
    // answers a routable 5xx and no stream is ever committed.
    peerProvider.failBeforeStream = true;
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, peer.origin, [PeerWorkloadClass.Chat,],);
    await writeAssignmentMatrix({ database: caller.db, matrix: { preferences: { chat: [peer.origin,], }, }, },);

    const decision = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, },);
    expect(decision.target,).toBe("peer",);

    let localCalls = 0;
    const response = await dispatchPeerWorkload({
      callerOrigin: caller.origin,
      decision,
      request: CHAT_WIRE_REQUEST,
      bearer: SHARED_TOKEN,
      local: () => {
        localCalls += 1;
        return Promise.resolve(LOCAL_RESPONSE,);
      },
    },);

    // Exactly one local attempt — the epic's "retry is once" rule.
    expect(localCalls,).toBe(1,);
    expect(response.content,).toBe("local answer",);
  });

  test("a peer failing AFTER streaming begins discards the partial output instead of retrying", async () => {
    peerProvider.failAfterStream = true;
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, peer.origin, [PeerWorkloadClass.Chat,],);
    await writeAssignmentMatrix({ database: caller.db, matrix: { preferences: { chat: [peer.origin,], }, }, },);

    const decision = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, },);
    expect(decision.target,).toBe("peer",);

    const emitted: ChunkEvent[] = [];
    let localCalls = 0;
    const thrown: unknown = await dispatchPeerWorkload({
      callerOrigin: caller.origin,
      decision,
      request: CHAT_WIRE_REQUEST,
      bearer: SHARED_TOKEN,
      onChunk: (chunk,) => {
        emitted.push(chunk,);
      },
      local: () => {
        localCalls += 1;
        return Promise.resolve(LOCAL_RESPONSE,);
      },
    },).catch((error: unknown,) => error);

    // No retry at all: the caller is told the attempt failed rather than being
    // handed a reply stitched together from two generations.
    expect(localCalls,).toBe(0,);
    expect(thrown,).toBeInstanceOf(PeerWorkPartialOutputError,);

    // Whatever reached the caller is the peer's own prefix only — never
    // concatenated with a local continuation.
    const streamed = emitted
      .filter((chunk,) => chunk.type === "content")
      .map((chunk,) => ("content" in chunk ? chunk.content : ""))
      .join("",);

    expect(streamed,).toBe("half an answer",);
    expect(streamed.includes("local answer",),).toBe(false,);
  });

  test("chat stickiness pins repeated turns to the same peer", async () => {
    const standIn = await instance();
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, peer.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, standIn.origin, [PeerWorkloadClass.Chat,],);
    // TWO eligible peers, and the matrix RANKING prefers `standIn`. A pin to
    // the lower-ranked `peer` is therefore load-bearing: without it the router
    // would send turn 2 to `standIn`, so this cannot pass by coincidence.
    await writeAssignmentMatrix({
      database: caller.db,
      matrix: { preferences: { chat: [standIn.origin, peer.origin,], }, },
    },);

    const affinityKey = "chat-affinity-key-1";

    // Turn 1: nothing pinned, so RANKING decides. Which peer that is depends on
    // headroom, latency EWMA and finally an origin-string tiebreak — and the
    // tiebreak is not predictable, because ephemeral ports make the origins
    // differ every run. So do NOT assert a particular winner; pin the peer
    // ranking did NOT choose, which is what makes the pin load-bearing.
    const first = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, affinityKey, },);
    expect(first.target,).toBe("peer",);
    if (first.target !== "peer") { throw new Error("expected a peer route",); }

    const pinnedOrigin = first.peer.origin === standIn.origin ? peer.origin : standIn.origin;

    await pinWorkloadPeer(caller.db, {
      affinityKey,
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: pinnedOrigin,
    },);

    // Turn 2: the pin wins over the ranking.
    const second = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, affinityKey, },);
    expect(second.target,).toBe("peer",);
    if (second.target !== "peer") { throw new Error("expected a peer route",); }
    expect(second.peer.origin,).toBe(pinnedOrigin,);
    // And it is genuinely NOT the peer ranking chose on its own.
    expect(second.peer.origin,).not.toBe(first.peer.origin,);
    expect(second.reason,).toBe("sticky-assignment",);

    // The pin is durable state, read back from the caller's DB.
    const pinned = await readWorkAssignment(caller.db, {
      affinityKey,
      workloadClass: PeerWorkloadClass.Chat,
    },);

    expect(pinned?.peerOrigin,).toBe(pinnedOrigin,);
  });

  test("an ineligible peer releases the pin, and the release is recorded with its reason", async () => {
    const standIn = await instance();
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, peer.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, standIn.origin, [PeerWorkloadClass.Chat,],);
    await writeAssignmentMatrix({
      database: caller.db,
      matrix: { preferences: { chat: [peer.origin, standIn.origin,], }, },
    },);

    const affinityKey = "chat-affinity-key-2";
    await pinWorkloadPeer(caller.db, {
      affinityKey,
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: peer.origin,
    },);

    // The pinned peer loses workload trust: ineligible, not merely down.
    await caller.db
      .updateTable("mesh_peers",)
      .set({ workload_trust: 0, },)
      .where("origin", "=", peer.origin,)
      .execute();

    // The call reassigns to the still-eligible peer.
    const next = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, affinityKey, },);
    expect(next.target,).toBe("peer",);
    if (next.target !== "peer") { throw new Error("expected a reassignment",); }
    expect(next.peer.origin,).toBe(standIn.origin,);

    await pinWorkloadPeer(caller.db, {
      affinityKey,
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: standIn.origin,
      replaces: { previousOrigin: peer.origin, reason: "peer-ineligible", },
    },);

    // Read the whole audit row back from mesh_work_assignments.
    const row = await caller.db
      .selectFrom("mesh_work_assignments",)
      .select(["peer_origin", "previous_origin", "released_at", "release_reason",],)
      .where("affinity_key", "=", affinityKey,)
      .where("workload_class", "=", PeerWorkloadClass.Chat,)
      .executeTakeFirstOrThrow();

    expect(row.peer_origin,).toBe(standIn.origin,);
    expect(row.previous_origin,).toBe(peer.origin,);
    expect(row.release_reason,).toBe("peer-ineligible",);
    // A fresh pin is live by definition, so the dead-pin marker is cleared.
    expect(row.released_at,).toBeNull();

    // And an explicit release with no replacement still stamps the row.
    const released = await releaseWorkAssignment(caller.db, {
      affinityKey,
      workloadClass: PeerWorkloadClass.Chat,
      reason: "circuit-open",
    },);

    expect(released,).toBe(true,);

    const afterRelease = await caller.db
      .selectFrom("mesh_work_assignments",)
      .select(["released_at", "release_reason",],)
      .where("affinity_key", "=", affinityKey,)
      .executeTakeFirstOrThrow();

    expect(afterRelease.released_at,).not.toBeNull();
    expect(afterRelease.release_reason,).toBe("circuit-open",);
  });

  test("data minimization: the peer receives the workload slice and no unrelated chat or user data", async () => {
    await trustCallerOnPeer(peer.db, caller.origin, [PeerWorkloadClass.Chat,],);
    await registerPeerOnCaller(caller.db, peer.origin, [PeerWorkloadClass.Chat,],);
    await writeAssignmentMatrix({ database: caller.db, matrix: { preferences: { chat: [peer.origin,], }, }, },);

    const decision = await routeFor(caller.db, { workloadClass: PeerWorkloadClass.Chat, },);
    await dispatchPeerWorkload({
      callerOrigin: caller.origin,
      decision,
      request: CHAT_WIRE_REQUEST,
      bearer: SHARED_TOKEN,
      local: () => Promise.reject(new Error("unexpected local path",),),
    },);

    // What actually reached the peer's own provider, read from the peer side.
    expect(peerProviderSaw,).toHaveLength(1,);
    const received = peerProviderSaw[0];
    if (!received) { throw new Error("peer provider received no workload",); }

    // The workload's needs are present.
    expect(received.messages,).toEqual([{ role: "user", content: "roll a perception check", },],);
    expect(received.model,).toBe("peer-model",);

    // Every message object carries ONLY role and content — no id, no author,
    // no timestamp, no persona or character identity.
    for (const message of received.messages) {
      expect(Object.keys(message,).sort(),).toEqual(["content", "role",],);
    }

    // And no unrelated identifier or secret rides along in the request.
    const forbidden = [
      "chatId",
      "userId",
      "sessionId",
      "personaId",
      "characterId",
      "apiKey",
      "password",
      "secret",
      "sharedToken",
      "meshPsk",
      "createdAt",
      "updatedAt",
      "timestamp",
    ];

    const keys = Object.keys(received,);
    for (const key of forbidden) {
      expect(keys, `${key} must not reach the peer`,).not.toContain(key,);
    }
  });
});
