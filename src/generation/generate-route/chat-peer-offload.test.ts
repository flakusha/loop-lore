// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CONSUMER-VISIBLE tests for the ONE live peer-offload call site
 * (TASK-federation-offload-adopt-dispatch-in-the-chat-turn-call-site).
 *
 * Every test drives the real `streamToClient` — the production chat turn —
 * against a real migrated SQLite DB and, where a peer is eligible, a real
 * `federationRoutes` app on a real loopback socket. Nothing here asserts on
 * wiring: each case asserts what the CLIENT receives and which provider chain
 * actually ran.
 */

import type { Config, } from "@/config/schema";
import type { Db, } from "@/db";
import {
  ActorType,
  GenerationStatus,
  MessageRole,
  MessageStatus,
  MessageVisibility,
  PeerAuthMode,
  PeerInstanceKind,
  PeerWorkloadClass,
} from "@/db/enums";
import { setPeerState, upsertPeer, } from "@/federation/coordinator";
import { writeAssignmentMatrix, } from "@/federation/peer-assignment-matrix";
import { resetPeerHealth, } from "@/federation/peer-health";
import { savePeerWorkload, } from "@/federation/peer-registry";
import { pinWorkloadPeer, readWorkAssignment, } from "@/federation/peer-work-assignments";
import { resetPerformanceQuota, } from "@/federation/performance-quota";
import {
  DEFAULT_POLICY_DETECTION,
  DEFAULT_REPETITION_DETECTION,
  DEFAULT_RESPONSE_LIMIT,
} from "@/generation/gen-types-options";
import { registerProvider, unregisterProvider, } from "@/generation/providers/registry";
import type {
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ModelInfo,
  StreamHandler,
} from "@/generation/providers/types";
import { federationRoutes, } from "@/routes/federation";
import { createTestDb, destroyTestDb, type TestDb, } from "@/test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertGenerationAttempts,
  insertMessages,
  insertUsers,
} from "@/test-utils/insert-helpers";
import { MockLLMProvider, } from "@/test-utils/mock-provider";
import { afterAll, afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { KyselyPlugin, } from "kysely";
import { dispatchChatGeneration, } from "./chat-peer-offload";
import { streamToClient, } from "./stream-to-client";

const SECRET = "call-site-fed-secret-0123456789";
const PSK = "call-site-fed-psk";
const SHARED_TOKEN = "call-site-shared-credential";
const PROVIDER = "peer-llm";
const CHAT_ID = "chat-offload-1";
/** The caller's own origin — the peer must admit exactly this identity. */
const CALLER_ORIGIN = "http://127.0.0.1:9001";
const USER_ID = "user-offload-1";
const ACTOR_ID = "actor-offload-1";
const PARENT_ID = "msg-offload-parent";
const ATTEMPT_ID = "att-offload-1";

/** Boot order bookkeeping so a thrown assertion leaks nothing. */
const opened: Array<() => Promise<void>> = [];
/** This file's original NO_PROXY, restored in afterAll. */
const originalNoProxy = process.env.NO_PROXY;

/** What the PEER's local provider chain saw, so "the peer served it" is provable. */
const peerProviderSaw: GenerateRequest[] = [];
/** What the CALLER's local provider chain saw — the pre-offload behaviour. */
const callerProviderSaw: GenerateRequest[] = [];

/** The peer's provider: fails before streaming, or after, on demand. */
class PeerProvider extends MockLLMProvider {
  failBeforeStream = false;
  failAfterStream = false;

  override stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    peerProviderSaw.push(req,);
    if (this.failBeforeStream) { return Promise.reject(new Error("peer died before streaming",),); }
    if (this.failAfterStream) {
      handler({ type: "content", content: "PEER-PREFIX ", },);
      return Promise.reject(new Error("peer died mid-generation",),);
    }

    return super.stream(req, handler,);
  }

  override listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([{ id: "peer-model", },],);
  }
}

/** The caller's local provider — unchanged, ordinary, the pre-offload path. */
class CallerProvider extends MockLLMProvider {
  override stream(req: GenerateRequest, handler: StreamHandler,): Promise<GenerateResponse> {
    callerProviderSaw.push(req,);
    handler({ type: "content", content: "LOCAL-ANSWER", },);
    return Promise.resolve({
      content: "LOCAL-ANSWER",
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
    },);
  }

  override listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([{ id: "local-model", },],);
  }
}

let peerProvider: PeerProvider;

/** Federation config with `enabled` and the declared classes as named. */
function instanceConfig(options: {
  enabled: boolean;
  classes?: PeerWorkloadClass[];
},): Config {
  return {
    server: { host: "127.0.0.1", port: 9001, tls: undefined, trustProxy: true, publicOrigin: CALLER_ORIGIN, },
    auth: { registrationOpen: false, required: false, jwtSecret: "call-site-jwt", },
    byoKey: { enabled: true, encryptionKey: SECRET, },
    generation: { defaultProvider: PROVIDER, defaultModels: { [PROVIDER]: "peer-model", }, },
    federation: {
      enabled: options.enabled,
      seeds: [],
      peers: [],
      meshPsk: PSK,
      duplication: { mode: "trusted", peers: [], },
      workloadOffload: { classes: options.classes ?? [], },
    },
  } as unknown as Config;
}

/**
 * A real federation app on a real ephemeral loopback port, with its own DB.
 *
 * `label` only changes the ORIGIN STRING the caller registers and calls the
 * peer by; the socket is always loopback. It exists so a test can force a
 * deterministic ordering between two peers - the router's final tie-break is
 * a plain string compare on the origin, and ephemeral ports would otherwise
 * decide the outcome of every run.
 */
async function bootPeer(label = "127.0.0.1",): Promise<{ origin: string; db: Db; close: () => Promise<void> }> {
  const fixture: TestDb = await createTestDb();
  const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);
  const app = federationRoutes({ config, database: fixture.db as Db, } as never,);
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: (request: Request,) => app.handle(request,),
  },);

  process.env.NO_PROXY = process.env.NO_PROXY
    ? `${process.env.NO_PROXY},127.0.0.1,localhost`
    : "127.0.0.1,localhost";

  const booted = {
    origin: `http://${label}:${server.port}`,
    db: fixture.db as Db,
    close: async () => {
      await server.stop(true,);
      await destroyTestDb(fixture,);
    },
  };

  opened.push(booted.close,);
  return booted;
}

/** Trust the caller on the peer, for exactly the chat class. */
async function trustCallerOnPeer(peerDb: Db, callerOrigin: string,): Promise<void> {
  await savePeerWorkload(peerDb, {
    origin: callerOrigin,
    encryptionKey: SECRET,
    displayName: "business instance",
    instanceKind: PeerInstanceKind.Business,
    authMode: PeerAuthMode.HostLocal,
    sharedToken: SHARED_TOKEN,
    workloadTrust: true,
    allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    stickyEnabled: true,
  },);

  await setPeerState(peerDb, callerOrigin, "trusted",);
}

/** Register the peer as routable on the caller, without touching the matrix. */
async function registerPeerOnCaller(callerDb: Db, peerOrigin: string,): Promise<void> {
  await savePeerWorkload(callerDb, {
    origin: peerOrigin,
    encryptionKey: SECRET,
    displayName: "rpg assistant",
    instanceKind: PeerInstanceKind.Rpg,
    authMode: PeerAuthMode.HostLocal,
    sharedToken: SHARED_TOKEN,
    workloadTrust: true,
    allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    stickyEnabled: true,
  },);

  await upsertPeer(callerDb, {
    origin: peerOrigin,
    state: "trusted",
    capabilities: [PeerWorkloadClass.Chat,],
  },);
}

/** Register the peer as routable, and give `chat` a matrix row naming it. */
async function routePeerOnCaller(callerDb: Db, peerOrigin: string,): Promise<void> {
  await registerPeerOnCaller(callerDb, peerOrigin,);
  await writeAssignmentMatrix({
    database: callerDb,
    matrix: { preferences: { chat: [peerOrigin,], }, },
  },);
}

/** One SSE frame as the client receives it. */
type Frame = { type: string; content?: string; error?: string; messageId?: string };

/** Read a whole SSE body into its frames. */
async function framesOf(response: Response,): Promise<Frame[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buffer = "";
  for (;;) {
    const { done, value, } = await reader.read();
    if (done) { break; }
    buffer += decoder.decode(value, { stream: true, },);
    let index = buffer.indexOf("\n\n",);
    while (index !== -1) {
      const block = buffer.slice(0, index,);
      buffer = buffer.slice(index + 2,);
      const line = block.split("\n",).find((entry,) => entry.startsWith("data: ",));
      if (line !== undefined) { frames.push(JSON.parse(line.slice(6,),) as Frame,); }
      index = buffer.indexOf("\n\n",);
    }
  }

  return frames;
}

/**
 * Record every SQL statement the turn issues, so "off" can be proven as zero
 * federation lookups rather than asserted by inspecting the decision.
 */
function recordQueries(sink: { sql: string[] },): KyselyPlugin {
  return {
    transformQuery: (args,) => {
      sink.sql.push(JSON.stringify(args.node,).replace(/["{}]/g, "",).replace(/\s+/g, " ",),);
      return args.node;
    },
    transformResult: (args,) => Promise.resolve(args.result,),
  };
}

/** Every statement that touched a federation routing table. */
function federationQueries(sql: string[],): string[] {
  return sql.filter((statement,) => /mesh_peers|mesh_work_assignments|system_config/.test(statement,));
}

/**
 * A caller DB with the rows a real chat turn needs: the user, the generating
 * actor, the chat, a parent message, and the attempt row the turn writes into.
 */
async function seedCallerDb(db: Db,): Promise<{ actorId: string; parentMessageId: string; attemptId: string }> {
  await insertUsers(db, "offload-user", "Offload User", { id: USER_ID, },);
  const actorId = await insertActors(db, "Narrator", { id: ACTOR_ID, actor_type: ActorType.Character, },);
  await insertChats(db, "offload chat", USER_ID, { id: CHAT_ID, },);
  const parentMessageId = await insertMessages(db, CHAT_ID, actorId, MessageRole.User, "roll a perception check", {
    id: PARENT_ID,
    status: MessageStatus.Confirmed,
    visibility: MessageVisibility.Visible,
  },);

  const attemptId = await insertGenerationAttempts(
    db,
    CHAT_ID,
    parentMessageId,
    actorId,
    `idem-${CHAT_ID}`,
    "peer-model",
    PROVIDER,
    {
      id: ATTEMPT_ID,
      status: GenerationStatus.Streaming,
    },
  );

  return { actorId, parentMessageId, attemptId, };
}

/** Drive the real chat turn: `streamToClient` with an ordinary local provider. */
function runChatTurn(options: {
  fixture: TestDb;
  config: Config;
  local: LLMProvider;
  ids: { actorId: string; parentMessageId: string; attemptId: string };
  /** Swap in a decorated handle (e.g. with a query-counting plugin). */
  database?: unknown;
},): Response {
  return streamToClient({
    input: {
      chatId: CHAT_ID,
      actorId: options.ids.actorId,
      parentMessageId: options.ids.parentMessageId,
      idempotencyKey: `idem-${CHAT_ID}`,
      repetitionDetection: DEFAULT_REPETITION_DETECTION,
      policyDetection: DEFAULT_POLICY_DETECTION,
      responseLimit: DEFAULT_RESPONSE_LIMIT,
    },
    database: (options.database ?? options.fixture.db) as never,
    messages: [{ role: "user", content: "roll a perception check", },],
    cfg: options.config,
    userId: USER_ID,
    attemptId: options.ids.attemptId,
    modelId: "peer-model",
    providerName: PROVIDER,
    providerReq: {
      model: "peer-model",
      messages: [{ role: "user", content: "roll a perception check", },],
      params: { stream: true, temperature: 0.4, maxTokens: 64, },
    },
    failoverList: [{ name: PROVIDER, provider: options.local, },],
  },);
}

describe("chat turn — peer offload call site", () => {
  let fixture: TestDb;
  let ids: { actorId: string; parentMessageId: string; attemptId: string };

  beforeEach(async () => {
    opened.length = 0;
    resetPeerHealth();
    resetPerformanceQuota();
    peerProviderSaw.length = 0;
    callerProviderSaw.length = 0;
    peerProvider = new PeerProvider();
    registerProvider(PROVIDER, peerProvider,);
    fixture = await createTestDb();
    ids = await seedCallerDb(fixture.db as Db,);
  }, 30_000,);

  afterEach(async () => {
    resetPeerHealth();
    resetPerformanceQuota();
    unregisterProvider(PROVIDER,);
    for (const close of opened.splice(0,)) { await close(); }
    await destroyTestDb(fixture,);
  }, 30_000,);

  afterAll(() => {
    if (originalNoProxy === undefined) {
      delete process.env.NO_PROXY;
    } else {
      process.env.NO_PROXY = originalNoProxy;
    }
  },);

  test("federation disabled: the client sees the local answer and the caller's chain runs it", async () => {
    // Everything is set up to offload — the ONLY thing preventing it is the
    // operator's `enabled: false`. If the gate leaked, this would serve remotely.
    const peer = await bootPeer();
    await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    const config = instanceConfig({ enabled: false, classes: [PeerWorkloadClass.Chat,], },);

    const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

    const done = frames.find((frame,) => frame.type === "done");
    expect(done?.content,).toBe("LOCAL-ANSWER",);
    expect(frames.filter((frame,) => frame.type === "content").map((frame,) => frame.content).join("",),)
      .toBe("LOCAL-ANSWER",);

    // The peer's chain never ran: no wire call, no provider call.
    expect(peerProviderSaw,).toEqual([],);
    expect(callerProviderSaw,).toHaveLength(1,);
  }, 30_000,);

  test("federation disabled: the turn issues ZERO peer resolution queries", async () => {
    const peer = await bootPeer();
    await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    const config = instanceConfig({ enabled: false, classes: [PeerWorkloadClass.Chat,], },);
    const sink = { sql: [] as string[], };
    const counted = (fixture.db as unknown as { withPlugin: (plugin: KyselyPlugin,) => unknown })
      .withPlugin(recordQueries(sink,),);

    const frames = await framesOf(runChatTurn({
      fixture,
      config,
      local: new CallerProvider(),
      ids,
      database: counted,
    },),);

    expect(frames.find((frame,) => frame.type === "done")?.content,).toBe("LOCAL-ANSWER",);
    // Not merely "no peer was chosen" — no routing table was read at all, so a
    // federation schema change cannot quietly start taxing the default path.
    expect(federationQueries(sink.sql,),).toEqual([],);
  }, 30_000,);

  test("workloadOffload declares no chat class: still the local answer, peer untouched", async () => {
    const peer = await bootPeer();
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    const config = instanceConfig({ enabled: true, classes: [], },);

    const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

    expect(frames.find((frame,) => frame.type === "done")?.content,).toBe("LOCAL-ANSWER",);
    expect(peerProviderSaw,).toEqual([],);
  }, 30_000,);

  test("no matrix row for chat: still the local answer, peer untouched", async () => {
    const peer = await bootPeer();
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    // The peer is registered and trusted, but the operator never named it for chat.
    await writeAssignmentMatrix({ database: fixture.db as Db, matrix: { preferences: {}, }, },);
    const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);

    const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

    expect(frames.find((frame,) => frame.type === "done")?.content,).toBe("LOCAL-ANSWER",);
    expect(peerProviderSaw,).toEqual([],);
  }, 30_000,);

  test("an eligible peer with a chat matrix row serves the turn and the caller's chain does not run", async () => {
    const peer = await bootPeer();
    await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);

    const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

    // The PEER's own provider chain produced the answer the client received.
    expect(peerProviderSaw,).toHaveLength(1,);
    expect(peerProviderSaw[0]?.messages[0]?.content,).toBe("roll a perception check",);
    expect(callerProviderSaw,).toEqual([],);
    expect(frames.find((frame,) => frame.type === "done")?.content,).toBe("Mock streamed response",);
  }, 30_000,);

  test(
    "a peer that fails before streaming retries local EXACTLY once and the user still gets a full answer",
    async () => {
      const peer = await bootPeer();
      peerProvider.failBeforeStream = true;
      await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
      await routePeerOnCaller(fixture.db as Db, peer.origin,);
      const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);

      const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

      // One remote attempt, exactly one local retry.
      expect(peerProviderSaw,).toHaveLength(1,);
      expect(callerProviderSaw,).toHaveLength(1,);
      const streamed = frames.filter((frame,) => frame.type === "content").map((frame,) => frame.content).join("",);
      expect(streamed,).toBe("LOCAL-ANSWER",);
      expect(frames.find((frame,) => frame.type === "done")?.content,).toBe("LOCAL-ANSWER",);
      expect(frames.some((frame,) => frame.type === "error"),).toBe(false,);
    },
    30_000,
  );

  test("a peer that streams then fails emits NO concatenated or duplicated reply at this call site", async () => {
    const peer = await bootPeer();
    peerProvider.failAfterStream = true;
    await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);

    const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

    const content = frames.filter((frame,) => frame.type === "content").map((frame,) => frame.content);
    const streamed = content.join("",);

    // What the peer streamed BEFORE it died reached the client once — those
    // bytes were already on the wire, so they are not "partial output" that
    // can be taken back.
    expect(content.filter((chunk,) => chunk === "PEER-PREFIX "),).toHaveLength(1,);

    // The rule under test: nothing is appended to them. No local answer is
    // concatenated, the peer's bytes are not re-sent, and no `done` frame
    // claims a complete turn was produced.
    expect(streamed,).toBe("PEER-PREFIX ",);
    expect(streamed,).not.toContain("LOCAL-ANSWER",);
    expect(callerProviderSaw,).toEqual([],);
    expect(frames.some((frame,) => frame.type === "done"),).toBe(false,);
    expect(frames.some((frame,) => frame.type === "error"),).toBe(true,);
  }, 30_000,);

  test(
    "stickiness reads the CHAT's pin, not a fresh key: the pinned peer beats the matrix's first choice",
    async () => {
      // SERVING is registered and trusted, so it will answer. REFUSING is
      // registered and trusted LOCALLY (so it is genuinely eligible for routing)
      // but has never admitted this caller, so it rejects the workload with 403.
      //
      // Both are in the matrix and the chat is pinned to SERVING. Without the pin
      // being found, the router falls through to its rank tie-break — a string
      // compare on the origin — which is why REFUSING is addressed as
      // `127.0.0.1` and SERVING as `localhost`: only that makes the no-pin path
      // deterministically land on REFUSING instead of on whichever ephemeral
      // port happened to be lower.
      const refusing = await bootPeer("127.0.0.1",);
      const serving = await bootPeer("localhost",);
      await trustCallerOnPeer(serving.db, CALLER_ORIGIN,);
      for (const peer of [refusing, serving,]) { await registerPeerOnCaller(fixture.db as Db, peer.origin,); }
      await writeAssignmentMatrix({
        database: fixture.db as Db,
        matrix: { preferences: { chat: [refusing.origin, serving.origin,], }, },
      },);

      await pinWorkloadPeer(fixture.db as Db, {
        affinityKey: CHAT_ID,
        workloadClass: PeerWorkloadClass.Chat,
        peerOrigin: serving.origin,
      },);

      const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);

      const frames = await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

      // Served remotely by the pinned peer: no local retry, so the caller's own
      // chain was never needed.
      expect(frames.find((frame,) => frame.type === "done")?.content,).toBe("Mock streamed response",);
      expect(callerProviderSaw,).toEqual([],);
      expect(peerProviderSaw,).toHaveLength(1,);

      // The pin this call site wrote back is still keyed by the CHAT, not by a
      // per-turn handle, and still names the peer the turn actually ran on.
      const assignment = await readWorkAssignment(fixture.db as Db, {
        affinityKey: CHAT_ID,
        workloadClass: PeerWorkloadClass.Chat,
      },);

      expect(assignment?.affinityKey,).toBe(CHAT_ID,);
      expect(assignment?.peerOrigin,).toBe(serving.origin,);
    },
    30_000,
  );

  test("another chat's pin does not leak: a fresh chat routes on the matrix, not the neighbour's pin", async () => {
    const peer = await bootPeer();
    await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    await pinWorkloadPeer(fixture.db as Db, {
      affinityKey: "some-other-chat",
      workloadClass: PeerWorkloadClass.Chat,
      peerOrigin: peer.origin,
    },);

    const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);

    await framesOf(runChatTurn({ fixture, config, local: new CallerProvider(), ids, },),);

    const mine = await readWorkAssignment(fixture.db as Db, {
      affinityKey: CHAT_ID,
      workloadClass: PeerWorkloadClass.Chat,
    },);

    const theirs = await readWorkAssignment(fixture.db as Db, {
      affinityKey: "some-other-chat",
      workloadClass: PeerWorkloadClass.Chat,
    },);

    expect(mine?.affinityKey,).toBe(CHAT_ID,);
    expect(theirs?.affinityKey,).toBe("some-other-chat",);
  }, 30_000,);

  test("a turn the wire cannot carry stays local even when a peer is eligible", async () => {
    // The peer wire is `{ role, content }` and nothing else. A turn carrying an
    // inline image would be silently mangled outbound, so it must never be
    // offloaded — this is the guard that keeps the offload honest about what it
    // can represent, and it is invisible from the SSE frames alone.
    const peer = await bootPeer();
    await trustCallerOnPeer(peer.db, CALLER_ORIGIN,);
    await routePeerOnCaller(fixture.db as Db, peer.origin,);
    const config = instanceConfig({ enabled: true, classes: [PeerWorkloadClass.Chat,], },);
    const withImage = {
      role: "user" as const,
      content: "what is this",
      images: [{ mediaType: "image/png", base64: "aGk=", },],
    };

    let localCalls = 0;
    const response = await dispatchChatGeneration({
      config,
      database: fixture.db as Db,
      chatId: CHAT_ID,
      attemptId: ids.attemptId,
      messages: [withImage,],
      providerName: PROVIDER,
      modelId: "peer-model",
      temperature: 0.4,
      maxTokens: 64,
      local: () => {
        localCalls += 1;
        return Promise.resolve({
          content: "LOCAL-ANSWER",
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
        } as GenerateResponse,);
      },
    },);

    expect(localCalls,).toBe(1,);
    expect(response.content,).toBe("LOCAL-ANSWER",);
    expect(peerProviderSaw,).toEqual([],);
    // No pin was written: nothing was offloaded, so there is nothing to be
    // sticky to, and the next turn must be free to choose again.
    expect(
      await readWorkAssignment(fixture.db as Db, {
        affinityKey: CHAT_ID,
        workloadClass: PeerWorkloadClass.Chat,
      },),
    ).toBeNull();
  }, 30_000,);
});
