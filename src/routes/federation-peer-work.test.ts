// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer workload wire endpoints: mounting, authentication, authorization,
 * rejection codes, the no-leak property, chunk reassembly, and a two-instance
 * pass in which every byte crosses the real handlers.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { type Config, type FederationConfig, } from "../config/schema";
import { type Db, } from "../db";
import { PeerAuthMode, PeerWorkloadClass, } from "../db/enums";
import { setPeerState, upsertPeer, } from "../federation/coordinator";
import {
  listWorkloadPeers,
  savePeerWorkload,
  setAllowedWorkloadClasses,
  setWorkloadTrust,
} from "../federation/peer-registry";
import { authorizePeerWork, } from "../federation/peer-work-auth";
import { type PeerWorkTransport, runPeerWorkload, } from "../federation/peer-work-client";
import { type PeerWorkExecutor, } from "../federation/peer-work-execute";
import {
  assemblePeerWorkChunks,
  parsePeerWorkChunkLine,
  PEER_ORIGIN_HEADER,
  PEER_WORK_RUN_PATH,
  PEER_WORK_STREAM_TYPE,
  type PeerWorkRunRequest,
} from "../federation/peer-work-wire";
import { assertTrustedPeer, } from "../federation/sharing";
import { type ChunkEvent, type GenerateResponse, } from "../generation/providers/types";
import { createTestDb, } from "../test-utils/create-test-db";
import { mountPeerWorkApi, } from "./federation-peer-work";

const SECRET = "peer-wire-secret-0123456789";
const PSK = "peer-wire-psk";
const REMOTE = "https://gpu.example";
const LOOPBACK = "http://127.0.0.1:4010";
const SHARED = "same-host-shared-credential";

/** The leak shape the epic pins: no secret or identity may appear on the wire. */
const LEAK = /\b(apiKey|password|secret|token|userId|sessionId|chatId)\b/i;

function configWith(federation: Partial<FederationConfig>,): Config {
  return {
    server: { host: "localhost", port: 3000, tls: undefined, },
    auth: { registrationOpen: false, },
    byoKey: { enabled: true, encryptionKey: SECRET, },
    federation: {
      enabled: federation.enabled ?? false,
      seeds: [],
      peers: [],
      meshPsk: federation.meshPsk ?? PSK,
      duplication: { mode: "trusted", peers: [], },
      ...(federation.workloadOffload === undefined ? {} : { workloadOffload: federation.workloadOffload, }),
    },
  } as unknown as Config;
}

const ENABLED = configWith({
  enabled: true,
  workloadOffload: { classes: [PeerWorkloadClass.Chat, PeerWorkloadClass.Embedding,], },
},);

const DISABLED = configWith({ enabled: false, },);
const NO_DECLARED_CLASSES = configWith({ enabled: true, },);

/** A recording executor: counts admissions and replays a canned chunk list. */
function executorFor(chunks: ChunkEvent[],): PeerWorkExecutor & { calls: PeerWorkRunRequest[] } {
  const calls: PeerWorkRunRequest[] = [];
  return {
    calls,
    run: ({ request, onChunk, },) => {
      calls.push(request,);
      for (const chunk of chunks) { onChunk(chunk,); }
      return Promise.resolve(
        {
          content: chunks.filter((entry,) => entry.type === "content").map((entry,) => entry.content ?? "").join("",),
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, },
        } satisfies GenerateResponse,
      );
    },
  };
}

const HAPPY_CHUNKS: ChunkEvent[] = [
  { type: "content", content: "hel", },
  { type: "content", content: "lo", },
  { type: "done", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, }, },
];

function wireRequest(overrides: Partial<PeerWorkRunRequest> = {},): Record<string, unknown> {
  return {
    workloadClass: PeerWorkloadClass.Chat,
    assignmentKey: "opaque-handle-1234",
    provider: "local-llm",
    model: "test-model",
    messages: [{ role: "user", content: "hello", },],
    ...overrides,
  };
}

function asRequest(overrides: Partial<PeerWorkRunRequest> = {},): PeerWorkRunRequest {
  return {
    workloadClass: PeerWorkloadClass.Chat,
    assignmentKey: "opaque-handle-1234",
    provider: "local-llm",
    model: "test-model",
    messages: [{ role: "user", content: "hello", },],
    ...overrides,
  };
}

/** Seed a remote TLS peer that is fully workload-eligible. */
async function seedRemote(db: Db,): Promise<void> {
  await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: [PeerWorkloadClass.Chat,], },);
  await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);
  await setWorkloadTrust(db, { origin: REMOTE, workloadTrust: true, },);
}

/** Seed a same-host peer carrying a shared credential. */
async function seedLoopback(db: Db,): Promise<void> {
  await savePeerWorkload(db, {
    origin: LOOPBACK,
    authMode: PeerAuthMode.HostLocal,
    sharedToken: SHARED,
    encryptionKey: SECRET,
    allowedWorkloadClasses: [PeerWorkloadClass.Chat,],
    workloadTrust: true,
    stickyEnabled: true,
  },);

  await setPeerState(db, LOOPBACK, "trusted",);
}

async function appFor(config: Config, executor: PeerWorkExecutor,): Promise<{ app: Elysia; db: Db }> {
  const { db, } = await createTestDb();
  const app = new Elysia();
  mountPeerWorkApi(app, { config, database: db, encryptionKey: SECRET, runWorkload: executor, },);
  return { app, db, };
}

function post(body: unknown, headers: Record<string, string> = {}, signal?: AbortSignal,): Request {
  return new Request(`http://localhost${PEER_WORK_RUN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers, },
    body: JSON.stringify(body,),
    ...(signal === undefined ? {} : { signal, }),
  },);
}

async function rejection(res: Response,): Promise<{ status: number; errorCode: string; raw: string }> {
  const raw = await res.text();
  const body: unknown = JSON.parse(raw,);
  const data = typeof body === "object" && body !== null ? (body as { data?: unknown }).data : null;
  const errorCode = typeof data === "object" && data !== null
    ? String((data as { error_code?: unknown }).error_code,)
    : "";

  return { status: res.status, errorCode, raw, };
}

async function chunksOf(res: Response,): Promise<(ChunkEvent | null)[]> {
  const text = await res.text();
  return text.split("\n",).filter((line,) => line !== "").map((line,) => parsePeerWorkChunkLine(line,));
}

describe("peer-work route — mounting", () => {
  test("is not mounted (404) when federation is disabled", async () => {
    const { app, db, } = await appFor(DISABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    expect(res.status,).toBe(404,);
  });

  test("answers 503 with a routable code when the mesh PSK is unset", async () => {
    const { app, db, } = await appFor(configWith({ enabled: true, meshPsk: "", },), executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(503,);
    expect(body.errorCode,).toBe("federation.workload_not_configured",);
  });
});

describe("peer-work route — authentication", () => {
  test("a trusted, workload-trusted TLS peer is admitted and its chunks stream in order", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe(PEER_WORK_STREAM_TYPE,);
    const chunks = await chunksOf(res,);
    expect(chunks.map((chunk,) => chunk?.type),).toEqual(["content", "content", "done",],);
    expect(chunks[0]?.content,).toBe("hel",);
    expect(chunks[1]?.content,).toBe("lo",);
  });

  test("an unknown origin is refused before any work is admitted", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, } = await appFor(ENABLED, executor,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: "https://stranger.example", },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(403,);
    expect(body.errorCode,).toBe("federation.workload_peer_untrusted",);
    expect(executor.calls,).toHaveLength(0,);
  });

  test("an unusable origin is a 400, not a 403", async () => {
    const { app, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: "not-a-url", },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(400,);
    expect(body.errorCode,).toBe("federation.workload_invalid_origin",);
  });
});

describe("peer-work route — workload trust is independent of content trust", () => {
  test("a content-trusted peer without workload trust gets 403 and never reaches a provider", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await upsertPeer(db, { origin: REMOTE, state: "trusted", capabilities: [PeerWorkloadClass.Chat,], },);
    await setAllowedWorkloadClasses(db, { origin: REMOTE, classes: [PeerWorkloadClass.Chat,], },);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(403,);
    expect(body.errorCode,).toBe("federation.workload_trust_required",);
    expect(executor.calls,).toHaveLength(0,);
    // Content replication to the very same peer still succeeds.
    const trusted = await assertTrustedPeer(db, REMOTE,);
    expect(trusted?.state,).toBe("trusted",);
  });

  test("a class outside the peer's allowed set is refused with its own code", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const body400 = wireRequest({ workloadClass: PeerWorkloadClass.Vision, },);
    const res = await app.handle(post(body400, { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(403,);
    expect(body.errorCode,).toBe("federation.workload_class_not_allowed",);
  });

  test("a class this instance does not declare is refused even from an allowed peer", async () => {
    const { app, db, } = await appFor(NO_DECLARED_CLASSES, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    expect((await rejection(res,)).errorCode,).toBe("federation.workload_class_not_allowed",);
  });

  test("a malformed body is a 400 with a routable code", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post({ workloadClass: "chat", }, { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(400,);
    expect(body.errorCode,).toBe("federation.workload_invalid_request",);
  });

  test("a rejected body is never echoed back, secret fields included", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const tainted = { workloadClass: "chat", userId: "u-1", apiKey: "sk-live-secret-value", };
    const res = await app.handle(post(tainted, { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(400,);
    expect(body.raw,).not.toMatch(LEAK,);
    expect(body.raw,).not.toContain("sk-live-secret-value",);
  });

  test("an unknown workload class is a 400, never an admission", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);

    const unknownClass: Record<string, unknown> = { ...wireRequest(), workloadClass: "telepathy", };
    const res = await app.handle(post(unknownClass, { [PEER_ORIGIN_HEADER]: REMOTE, },),);

    expect((await rejection(res,)).status,).toBe(400,);
    expect(executor.calls,).toHaveLength(0,);
  });
});

describe("peer-work route — same-host peers cannot be unauthenticated", () => {
  test("a same-host peer presenting the right credential is admitted", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedLoopback(db,);

    const res = await app.handle(post(wireRequest(), {
      [PEER_ORIGIN_HEADER]: LOOPBACK,
      authorization: `Bearer ${SHARED}`,
    },),);

    expect(res.status,).toBe(200,);
  });

  test("a same-host peer presenting no credential is refused before admission", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedLoopback(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: LOOPBACK, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(403,);
    expect(body.errorCode,).toBe("federation.workload_credential_rejected",);
    expect(executor.calls,).toHaveLength(0,);
  });

  test("a same-host peer presenting the wrong credential is refused", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedLoopback(db,);

    const res = await app.handle(post(wireRequest(), {
      [PEER_ORIGIN_HEADER]: LOOPBACK,
      authorization: "Bearer not-the-shared-credential",
    },),);

    expect((await rejection(res,)).errorCode,).toBe("federation.workload_credential_rejected",);
  });

  test("a rejected credential is never echoed back", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedLoopback(db,);

    const res = await app.handle(post(wireRequest(), {
      [PEER_ORIGIN_HEADER]: LOOPBACK,
      authorization: `Bearer ${SHARED}-tampered`,
    },),);

    const body = await rejection(res,);

    expect(body.raw,).not.toContain(SHARED,);
    expect(body.raw,).not.toContain(SECRET,);
  });

  test("the saved peer record exposes that a credential exists but never the value", async () => {
    const { db, } = await createTestDb();
    await seedLoopback(db,);

    const [stored,] = await listWorkloadPeers(db,);
    expect(stored?.hasSharedToken,).toBe(true,);
    expect(JSON.stringify(stored,),).not.toContain(SHARED,);
  });
});

describe("peer-work route — data minimization across the wire", () => {
  test("the peer-visible body carries the workload and nothing else", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);
    await app.handle(post(
      wireRequest({ messages: [{ role: "user", content: "chat A only", },], },),
      { [PEER_ORIGIN_HEADER]: REMOTE, },
    ),);

    expect(JSON.stringify(executor.calls[0],),).not.toMatch(LEAK,);
    expect(executor.calls[0]?.messages,).toEqual([{ role: "user", content: "chat A only", },],);
  });

  test("a successful response body leaks no secret or identity", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    expect(await res.text(),).not.toMatch(LEAK,);
  });

  test("a rejection body leaks no secret or identity", async () => {
    const { app, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: "https://stranger.example", },),);
    expect((await rejection(res,)).raw,).not.toMatch(LEAK,);
  });
});

describe("peer-work route — cancellation and mid-stream failure", () => {
  test("a caller disconnect aborts the executor signal", async () => {
    let observed: AbortSignal | null = null;
    let signalEntered!: () => void;
    const entered = new Promise<void>((resolve,) => {
      signalEntered = resolve;
    },);

    const executor: PeerWorkExecutor = {
      run: ({ signal, },) => {
        observed = signal;
        signalEntered();
        return new Promise<GenerateResponse>((_, reject,) => {
          signal.addEventListener("abort", () => {
            reject(new Error("aborted",),);
          }, { once: true, },);
        },);
      },
    };

    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);

    const controller = new AbortController();
    const pending = app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, }, controller.signal,),);
    await entered;
    controller.abort();
    await pending;

    expect(observed,).not.toBeNull();
    expect((observed as AbortSignal | null)?.aborted,).toBe(true,);
  });

  test("an attempt that fails before streaming answers with a routable 5xx", async () => {
    const executor: PeerWorkExecutor = { run: () => Promise.reject(new Error("provider exploded",),), };
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    const body = await rejection(res,);

    expect(body.status,).toBe(500,);
    expect(body.errorCode,).toBe("federation.workload_failed",);
  });

  test("a failure after streaming began ends the stream with an error chunk", async () => {
    const executor: PeerWorkExecutor = {
      run: ({ onChunk, },) => {
        onChunk({ type: "content", content: "half a ", },);
        return Promise.reject(new Error("peer died mid-generation",),);
      },
    };

    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);
    expect(res.status,).toBe(200,);

    const chunks = await chunksOf(res,);
    expect(chunks.map((chunk,) => chunk?.type),).toEqual(["content", "error",],);
  });
});

describe("peer-work wire — two instances over real handlers", () => {
  test("the sender client and the receiver route reassemble one reply end to end", async () => {
    const { db, } = await createTestDb();
    const receiver = new Elysia();
    mountPeerWorkApi(receiver, {
      config: ENABLED,
      database: db,
      encryptionKey: SECRET,
      runWorkload: executorFor(HAPPY_CHUNKS,),
    },);

    await seedRemote(db,);

    // In-process forwarding: the sender's bytes cross the receiver's REAL route
    // handler, so no wire logic is stubbed out on either side.
    const forwardToReceiver: PeerWorkTransport = (options,) =>
      receiver.handle(
        new Request(options.url, {
          method: "POST",
          headers: options.headers,
          body: JSON.stringify(options.body,),
        },),
      );

    const attempt = await runPeerWorkload({
      peer: { origin: REMOTE, },
      request: asRequest(),
      bearer: null,
      transport: forwardToReceiver,
    },);

    expect(attempt.ok,).toBe(true,);
    expect(attempt.ok ? attempt.response.content : "",).toBe("hello",);
    expect(attempt.ok ? attempt.response.usage.totalTokens : 0,).toBe(3,);
  });

  test("a same-host peer passes its shared credential through the sender client", async () => {
    const { db, } = await createTestDb();
    const receiver = new Elysia();
    mountPeerWorkApi(receiver, {
      config: ENABLED,
      database: db,
      encryptionKey: SECRET,
      runWorkload: executorFor(HAPPY_CHUNKS,),
    },);

    await seedLoopback(db,);

    const forward = (bearer: string | null,): PeerWorkTransport => async (options,) => {
      const headers = { ...options.headers, };
      if (bearer !== null) { headers.authorization = `Bearer ${bearer}`; }
      return receiver.handle(
        new Request(options.url, {
          method: "POST",
          headers,
          body: JSON.stringify(options.body,),
        },),
      );
    };

    const denied = await runPeerWorkload({
      peer: { origin: LOOPBACK, },
      request: asRequest(),
      bearer: null,
      transport: forward(null,),
    },);

    expect(denied.ok,).toBe(false,);
    expect(denied.ok ? "" : denied.failure.code,).toBe("federation.workload_credential_rejected",);

    const allowed = await runPeerWorkload({
      peer: { origin: LOOPBACK, },
      request: asRequest(),
      bearer: SHARED,
      transport: forward(SHARED,),
    },);

    expect(allowed.ok,).toBe(true,);
  });

  test("the client assembles streamed chunks in arrival order", () => {
    const assembled = assemblePeerWorkChunks(HAPPY_CHUNKS,);

    expect(assembled?.content,).toBe("hello",);
    expect(assembled?.finishReason,).toBe("stop",);
  });

  test("the client reports a stream with no done chunk as incomplete", () => {
    expect(assemblePeerWorkChunks([{ type: "content", content: "half", },],),).toBeNull();
  });
});

describe("authorizePeerWork — the admission decision, called directly", () => {
  test("an eligible peer is admitted with its origin as the only identity returned", async () => {
    const { db, } = await createTestDb();
    await seedRemote(db,);

    const admission = await authorizePeerWork({
      database: db,
      config: ENABLED,
      claimedOrigin: REMOTE,
      bearer: null,
      workloadClass: PeerWorkloadClass.Chat,
      encryptionKey: SECRET,
    },);

    expect("origin" in admission && admission.origin,).toBe(REMOTE,);
    expect(JSON.stringify(admission,),).not.toMatch(LEAK,);
  });

  test("each gate names its own routable code and never the value that failed", async () => {
    const { db, } = await createTestDb();

    const unusable = await authorizePeerWork({
      database: db,
      config: ENABLED,
      claimedOrigin: "not-a-url",
      bearer: null,
      workloadClass: PeerWorkloadClass.Chat,
      encryptionKey: SECRET,
    },);

    expect("status" in unusable && unusable.status,).toBe(400,);
    expect("status" in unusable && unusable.errorCode,).toBe("federation.workload_invalid_origin",);

    await seedRemote(db,);
    const untrusted = await authorizePeerWork({
      database: db,
      config: ENABLED,
      claimedOrigin: "https://stranger.example",
      bearer: null,
      workloadClass: PeerWorkloadClass.Chat,
      encryptionKey: SECRET,
    },);

    expect("status" in untrusted && untrusted.errorCode,).toBe("federation.workload_peer_untrusted",);
  });
});

describe("authorizePeerWork — a credential this instance cannot decrypt is a rejection", () => {
  test("the wrong server secret rejects the peer rather than admitting it", async () => {
    const { db, } = await createTestDb();
    await seedLoopback(db,);

    // The token was sealed with SECRET; hand the verifier a different key.
    const admission = await authorizePeerWork({
      database: db,
      config: ENABLED,
      claimedOrigin: LOOPBACK,
      bearer: SHARED,
      workloadClass: PeerWorkloadClass.Chat,
      encryptionKey: "a-different-server-secret-012345",
    },);

    expect("status" in admission,).toBe(true,);
    expect("status" in admission && admission.status,).toBe(403,);
    expect("status" in admission && admission.errorCode,).toBe("federation.workload_credential_rejected",);
  });

  test("an instance with no encryption key at all cannot admit a same-host peer", async () => {
    const { db, } = await createTestDb();
    await seedLoopback(db,);

    const admission = await authorizePeerWork({
      database: db,
      config: ENABLED,
      claimedOrigin: LOOPBACK,
      bearer: SHARED,
      workloadClass: PeerWorkloadClass.Chat,
      encryptionKey: "",
    },);

    expect("status" in admission && admission.errorCode,).toBe("federation.workload_credential_rejected",);
  });
});

describe("peer-work route — the documented trust boundary", () => {
  test("an absent origin header is denied by default, never treated as anonymous access", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), {},),);
    const body = await rejection(res,);

    expect(res.status,).toBe(400,);
    expect(body.errorCode,).toBe("federation.workload_invalid_origin",);
    expect(executor.calls,).toHaveLength(0,);
  });

  test("an empty origin header is denied the same way", async () => {
    const { app, db, } = await appFor(ENABLED, executorFor(HAPPY_CHUNKS,),);
    await seedRemote(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: "", },),);

    expect((await rejection(res,)).errorCode,).toBe("federation.workload_invalid_origin",);
  });

  // KNOWN LIMITATION, pinned deliberately so it cannot be forgotten. A TLS
  // peer's identity is asserted by the `x-peer-origin` header and never proven:
  // the save path forbids a shared credential on a TLS peer and this runtime
  // enforces no client certificate. This test states that behaviour plainly.
  // It is NOT a claim that the design is correct — see the TRUST BOUNDARY note
  // in src/federation/peer-work-auth.ts and the open item on the wire ticket.
  // If a credential path is added for TLS peers, this test MUST fail so it is
  // rewritten at the same time.
  test("KNOWN LIMITATION: a TLS peer is admitted on an asserted origin alone, with no credential", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedRemote(db,);

    // No Authorization header, no proof of anything: only the header.
    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: REMOTE, },),);

    expect(res.status,).toBe(200,);
    expect(executor.calls,).toHaveLength(1,);
  });

  test("a host-local peer is NOT admitted on its asserted origin alone", async () => {
    const executor = executorFor(HAPPY_CHUNKS,);
    const { app, db, } = await appFor(ENABLED, executor,);
    await seedLoopback(db,);

    const res = await app.handle(post(wireRequest(), { [PEER_ORIGIN_HEADER]: LOOPBACK, },),);

    expect(res.status,).toBe(403,);
    expect(executor.calls,).toHaveLength(0,);
  });
});
