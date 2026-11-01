// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * fake-acp-server fixture tests for the server-originated surface:
 * `session/cancel`, `session/request_permission`, `fs/read_text_file`, and
 * the observation log. The fixture is driven at its raw stdio seam — the
 * same framing the adapter's JsonRpcProcess speaks — so a failing message
 * is visible verbatim.
 *
 * Resource contract (parallel-safe): each test owns one startFakeAcp
 * fixture and one stdio client child, both reaped in afterEach (including
 * failure paths). No ports, no shared state, no sleeps — every await is
 * bound to a specific wire message.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { type ChildProcessWithoutNullStreams, spawn, } from "node:child_process";
import { safeJsonParse, } from "../../utils";
import { type FakeAcpEnv, type FakeAcpLogEntry, type FakeAcpServer, startFakeAcp, } from "./fake-acp-server";

/** Servers started by the current test; reaped after each. */
const live: FakeAcpServer[] = [];
/** Stdio clients opened by the current test; killed after each. */
const clients: StdioClient[] = [];

/** One inbound JSON-RPC object off the fixture's stdout. */
interface WireMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string };
}

/** Predicate over inbound wire messages. */
type MessagePredicate = (m: WireMessage,) => boolean;

/**
 * Minimal NDJSON stdio driver for the fixture script — the transport role
 * the adapter's JsonRpcProcess normally plays, kept deliberately raw so the
 * fixture (not the transport) is the thing under test.
 */
class StdioClient {
  private nextId = 1;
  private readonly buffered: WireMessage[] = [];
  private readonly waiters: Array<{ pred: MessagePredicate; resolve: (m: WireMessage,) => void }> = [];
  private readonly child: ChildProcessWithoutNullStreams;

  /** @param argv - the fixture's spawn argv */
  constructor(argv: string[],) {
    this.child = spawn(argv[0]!, argv.slice(1,), { stdio: ["pipe", "pipe", "pipe",], },);
    this.child.stdout.setEncoding("utf8",);
    this.child.stdout.on("data", (chunk: string,) => this.ingest(chunk,),);
  }

  /** Parse stdout lines; hand each to a matching waiter or buffer it. */
  private ingest(chunk: string,): void {
    for (const line of chunk.split("\n",)) {
      const trimmed = line.trim();
      if (trimmed === "") { continue; }
      const parsed = safeJsonParse<WireMessage>(trimmed,);
      if (!parsed.ok) { continue; }
      const waiter = this.waiters.findIndex((w,) => w.pred(parsed.value,));
      if (waiter >= 0) {
        this.waiters.splice(waiter, 1,)[0]!.resolve(parsed.value,);
      } else {
        this.buffered.push(parsed.value,);
      }
    }
  }

  /** Send one raw wire object (request, response, or notification). */
  send(msg: Record<string, unknown>,): void {
    this.child.stdin.write(JSON.stringify(msg,) + "\n",);
  }

  /** Client request; resolves with the matching response object. */
  request(method: string, params: Record<string, unknown>,): Promise<WireMessage> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params, },);
    return this.waitFor((m,) => m.id === id);
  }

  /** Await the next inbound message matching the predicate (buffered first). */
  waitFor(pred: MessagePredicate,): Promise<WireMessage> {
    const idx = this.buffered.findIndex(pred,);
    if (idx >= 0) { return Promise.resolve(this.buffered.splice(idx, 1,)[0]!,); }
    return new Promise((resolve,) => {
      this.waiters.push({ pred, resolve, },);
    },);
  }

  /** initialize + session/new; resolves once the session id is known. */
  async openSession(): Promise<string> {
    const init = await this.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "test", version: "1", },
    },);

    expect(init.error,).toBeUndefined();
    const session = await this.request("session/new", { cwd: process.cwd(), },);
    expect(session.error,).toBeUndefined();
    return (session.result as { sessionId: string }).sessionId;
  }

  /** Hard-kill the child. */
  kill(): void {
    this.child.kill("SIGKILL",);
  }
}

/** Start a fixture and register it for teardown. */
function serve(env: FakeAcpEnv,): FakeAcpServer {
  const server = startFakeAcp(env,);
  live.push(server,);
  return server;
}

/** Open a stdio client and register it for teardown. */
function connect(argv: string[],): StdioClient {
  const client = new StdioClient(argv,);
  clients.push(client,);
  return client;
}

/** Drive a prompt request on an open session. */
function promptOn(client: StdioClient, sessionId: string,): Promise<WireMessage> {
  return client.request("session/prompt", { sessionId, prompt: [{ type: "text", text: "go", },], },);
}

/** The prompt reply's stopReason. */
function stopReason(reply: WireMessage,): string {
  return (reply.result as { stopReason: string }).stopReason;
}

afterEach(() => {
  while (clients.length > 0) { clients.pop()?.kill(); }
  while (live.length > 0) { live.pop()?.stop(); }
},);

describe("fake ACP fixture: session/cancel", () => {
  it("resolves a pending prompt when a session/cancel request arrives", async () => {
    const server = serve({ FAKE_AWAIT_CANCEL: "1", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    const cancel = await client.request("session/cancel", { sessionId, },);
    expect(cancel.error,).toBeUndefined();
    expect(stopReason(await prompt,),).toBe("cancelled",);
    expect(server.readLog(),).toEqual([{ event: "cancel", sessionId, },],);
  });

  it("also accepts session/cancel as a bare notification", async () => {
    const server = serve({ FAKE_AWAIT_CANCEL: "1", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    client.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId, }, },);
    expect(stopReason(await prompt,),).toBe("cancelled",);
    expect(server.readLog(),).toEqual([{ event: "cancel", sessionId, },],);
  });

  it("keeps the configured stopReason over the cancelled default", async () => {
    const server = serve({ FAKE_AWAIT_CANCEL: "1", FAKE_STOP: "max_tokens", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    await client.request("session/cancel", { sessionId, },);
    expect(stopReason(await prompt,),).toBe("max_tokens",);
  });

  it("records a cancel without a pending prompt and stays responsive", async () => {
    const server = serve({},);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();

    client.send({ jsonrpc: "2.0", method: "session/cancel", params: { sessionId, }, },);
    const reply = await promptOn(client, sessionId,);
    expect(stopReason(reply,),).toBe("end_turn",);
    expect(server.readLog(),).toEqual([{ event: "cancel", sessionId, },],);
  });
});

describe("fake ACP fixture: session/request_permission", () => {
  it("asks mid-prompt and logs the client's outcome", async () => {
    const server = serve({ FAKE_PERMISSION: "1", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    const ask = await client.waitFor((m,) => m.method === "session/request_permission");
    const params = ask.params as {
      sessionId: string;
      kind: string;
      options: Array<{ optionId: string; kind: string }>;
    };

    expect(params.sessionId,).toBe(sessionId,);
    expect(params.kind,).toBe("edit",);
    expect(params.options.map((o,) => o.kind),).toEqual(["allow_once", "reject_once",],);

    client.send({ jsonrpc: "2.0", id: ask.id, result: { outcome: { outcome: "allow_once", optionId: "allow", }, }, },);
    expect(stopReason(await prompt,),).toBe("end_turn",);
    expect(server.readLog(),).toEqual([
      { event: "permission_outcome", outcome: { outcome: { outcome: "allow_once", optionId: "allow", }, }, },
    ],);
  });

  it("continues the prompt when the client answers the ask with an error", async () => {
    const server = serve({ FAKE_PERMISSION: "1", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    const ask = await client.waitFor((m,) => m.method === "session/request_permission");
    client.send({ jsonrpc: "2.0", id: ask.id, error: { code: -32601, message: "no handler", }, },);
    expect(stopReason(await prompt,),).toBe("end_turn",);
    expect(server.readLog(),).toEqual([
      { event: "permission_outcome", outcome: { error: { code: -32601, message: "no handler", }, }, },
    ],);
  });
});

describe("fake ACP fixture: fs/read_text_file", () => {
  it("asks for the configured path and logs the returned content", async () => {
    const server = serve({ FAKE_READ_FILE: "/tmp/notes.md", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    const ask = await client.waitFor((m,) => m.method === "fs/read_text_file");
    expect((ask.params as { path: string }).path,).toBe("/tmp/notes.md",);
    client.send({ jsonrpc: "2.0", id: ask.id, result: { content: "file body", }, },);
    expect(stopReason(await prompt,),).toBe("end_turn",);
    expect(server.readLog(),).toEqual([
      { event: "read_text", path: "/tmp/notes.md", content: { content: "file body", }, },
    ],);
  });
});

describe("fake ACP fixture: combined flows", () => {
  it("runs permission, fs-read, then cancel in order when every knob is set", async () => {
    const server = serve({ FAKE_PERMISSION: "1", FAKE_READ_FILE: "/tmp/a.md", FAKE_AWAIT_CANCEL: "1", },);
    const client = connect(server.argv,);
    const sessionId = await client.openSession();
    const prompt = promptOn(client, sessionId,);

    const perm = await client.waitFor((m,) => m.method === "session/request_permission");
    client.send({ jsonrpc: "2.0", id: perm.id, result: { outcome: { outcome: "allow_once", optionId: "allow", }, }, },);
    const read = await client.waitFor((m,) => m.method === "fs/read_text_file");
    client.send({ jsonrpc: "2.0", id: read.id, result: { content: "A", }, },);
    await client.request("session/cancel", { sessionId, },);

    expect(stopReason(await prompt,),).toBe("cancelled",);
    const events = server.readLog().map((e: FakeAcpLogEntry,) => e.event);
    expect(events,).toEqual(["permission_outcome", "read_text", "cancel",],);
  });

  it("starts with an empty observation log", () => {
    const server = serve({},);
    expect(server.readLog(),).toEqual([],);
  });
});
