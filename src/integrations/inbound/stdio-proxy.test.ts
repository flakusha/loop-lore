// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-proxy.test.ts — Design B stdio shim (operator-approved).
 *
 * The running server gains a local-only TCP listener; the MCP/ACP stdio
 * mains gain a `--proxy` mode that relays bytes to it. Covered here:
 * proxy framing round-trip (stub transport pair), bad/missing token
 * rejected + audited, stdio EOF never stopping the server, loopback-only
 * bind config (default + non-loopback refusal), the shim relay against a
 * stub server, and one proxied op per protocol proving the server-side
 * lifecycle (facade run + audit row) is identical to a local turn.
 *
 * Resource contract (parallel-safe): ephemeral loopback ports (port 0),
 * one :memory: SQLite per file, one mkdtemp state dir per test (removed in
 * teardown), no fixed paths, no shared env mutation.
 */

import { Client, } from "@modelcontextprotocol/sdk/client/index.js";
import type { JSONRPCMessage, } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { chmodSync, mkdtempSync, rmSync, statSync, unlinkSync, } from "node:fs";
import { connect, createServer, type Socket, } from "node:net";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { PassThrough, } from "node:stream";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { setTestDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChatParticipants, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { resetFacadeRegistry, } from "../loop-lore-facade/instance";
import { initInboundSettings, resetInboundSettings, } from "./settings";
import {
  decodeProxyAck,
  decodeProxyHandshake,
  encodeProxyAck,
  encodeProxyHandshake,
  ensureProxyToken,
  isLoopbackHost,
  parseProxyAddr,
  parseProxyTarget,
  proxyAddrPath,
  proxyTokenPath,
  readProxyAddr,
  readProxyToken,
  readSocketLine,
  resolveProxyBind,
  resolveProxyClient,
  runStdioProxyRelay,
  STDIO_PROXY_LOOPBACK_DEFAULT,
  verifyProxyToken,
  writeProxyAddr,
} from "./stdio-proxy";
import { SocketProxyTransport, startStdioProxyListener, type StdioProxyListener, } from "./stdio-proxy-listener";

const USER = "proxy-test-user";
const CHAT = "proxy-test-chat";

let testDb: TestDb;
let db: Kysely<DB>;
let baseConfig: Config;

/** A fresh state-dir env pointing at a temp instance dir. */
function tempEnv(): { env: Record<string, string>; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "proxy-test-",),);
  return { env: { LOOP_LORE_STATE_DIR: dir, }, dir, };
}

/** Read every buffered line a socket has delivered so far. */
function readLines(socket: Socket, sink: string[],): void {
  let pending = "";
  socket.on("data", (chunk: Buffer,) => {
    pending += chunk.toString("utf8",);
    const lines = pending.split("\n",);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line !== "") { sink.push(line,); }
    }
  },);
}

/** Wait until the sink holds a line, or fail the test on timeout. */
async function nextLine(sink: string[], timeoutMs = 5000,): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const line = sink.shift();
    if (line !== undefined) { return line; }
    if (Date.now() > deadline) { throw new Error("timed out waiting for a proxied line",); }
    await new Promise((resolve,) => setTimeout(resolve, 10,));
  }
}

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  resetFacadeRegistry();
  resetInboundSettings();
  testDb = await createTestDb();
  db = testDb.db;
  setTestDatabase(db, testDb.sqlite,);
  baseConfig = createConfigSchema().defaults as unknown as Config;

  await insertUsers(db, USER, "Proxy Operator", { id: USER, },);
  await insertActors(db, "Proxy Operator", { id: USER, user_id: USER, owner_id: USER, },);
  await insertChats(db, "proxy-shim", USER, { id: CHAT, },);
  await insertChatParticipants(db, CHAT, USER, { role_in_chat: "owner", },);
},);

afterEach(async () => {
  setTestDatabase(null,);
  resetFacadeRegistry();
  resetInboundSettings();
  await destroyTestDb(testDb,);
},);

describe("stdio-proxy files and parsing", () => {
  test("token round-trips owner-only; addr round-trips; missing reads null", () => {
    const { env, dir, } = tempEnv();
    try {
      expect(readProxyToken(env,),).toBeNull();
      expect(readProxyAddr(env,),).toBeNull();
      const token = ensureProxyToken(env,);
      expect(token.length,).toBeGreaterThan(0,);
      expect(readProxyToken(env,),).toBe(token,);
      expect(statSync(proxyTokenPath(env,),).mode & 0o777,).toBe(0o600,);
      writeProxyAddr("127.0.0.1:4123", env,);
      expect(readProxyAddr(env,),).toBe("127.0.0.1:4123",);
      expect(proxyAddrPath(env,).startsWith(dir,),).toBe(true,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("a loose token file is chmodded back to owner-only", () => {
    const { env, dir, } = tempEnv();
    try {
      const before = ensureProxyToken(env,);
      chmodSync(proxyTokenPath(env,), 0o644,);
      expect(ensureProxyToken(env,),).toBe(before,);
      expect(statSync(proxyTokenPath(env,),).mode & 0o777,).toBe(0o600,);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("parseProxyAddr / parseProxyTarget / resolveProxyClient", () => {
    expect(parseProxyAddr(["bun", "stdio-server.ts",],),).toBeUndefined();
    expect(parseProxyAddr(["bun", "stdio-server.ts", "--proxy",],),).toBe("",);
    expect(parseProxyAddr(["bun", "x", "--proxy", "127.0.0.1:9",],),).toBe("127.0.0.1:9",);
    expect(parseProxyAddr(["bun", "x", "--proxy", "--other",],),).toBe("",);
    expect(parseProxyTarget("127.0.0.1:4123",),).toEqual({ host: "127.0.0.1", port: 4123, },);
    expect(parseProxyTarget("[::1]:4123",),).toEqual({ host: "::1", port: 4123, },);
    expect(() => parseProxyTarget("nope",)).toThrow("host:port",);
    expect(() => parseProxyTarget("127.0.0.1:0",)).toThrow("host:port",);

    const { env, dir, } = tempEnv();
    try {
      expect(() => resolveProxyClient("", env,)).toThrow("address unknown",);
      writeProxyAddr("127.0.0.1:1", env,);
      expect(() => resolveProxyClient("", env,)).toThrow("token missing",);
      const token = ensureProxyToken(env,);
      expect(resolveProxyClient("", env,),).toEqual({ addr: "127.0.0.1:1", token, },);
      expect(resolveProxyClient("127.0.0.1:2", env,),).toEqual({ addr: "127.0.0.1:2", token, },);
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("handshake/ack framing round-trips; malformed lines decode null", () => {
    const line = encodeProxyHandshake({ protocol: "mcp", token: "t", },);
    expect(line.endsWith("\n",),).toBe(true,);
    expect(decodeProxyHandshake(line.trim(),),).toEqual({ protocol: "mcp", token: "t", },);
    expect(decodeProxyHandshake("not json",),).toBeNull();
    expect(decodeProxyHandshake('{"protocol":"lsp","token":"t"}',),).toBeNull();
    expect(decodeProxyHandshake('{"protocol":"mcp"}',),).toBeNull();
    expect(verifyProxyToken("t", "t",),).toBe(true,);
    expect(verifyProxyToken("t", "other",),).toBe(false,);

    expect(decodeProxyAck(encodeProxyAck(true,).trim(),),).toEqual({ ok: true, },);
    expect(decodeProxyAck(encodeProxyAck(false, "nope",).trim(),),).toEqual({ ok: false, error: "nope", },);
    expect(decodeProxyAck("garbage",),).toBeNull();
    expect(decodeProxyAck('{"ok":"yes"}',),).toBeNull();
  });

  test("bind config defaults to loopback", () => {
    expect(resolveProxyBind(baseConfig,),).toBe(STDIO_PROXY_LOOPBACK_DEFAULT,);
    expect(resolveProxyBind(baseConfig,),).toBe("127.0.0.1",);
    expect(isLoopbackHost("127.0.0.1",),).toBe(true,);
    expect(isLoopbackHost("::1",),).toBe(true,);
    expect(isLoopbackHost("localhost",),).toBe(true,);
    expect(isLoopbackHost("0.0.0.0",),).toBe(false,);
    expect(isLoopbackHost("example.com",),).toBe(false,);
  });
});

describe("SocketProxyTransport framing", () => {
  /** In-memory linked pair speaking the transport's socket seam. */
  function linkedPair(): [StubWire, StubWire,] {
    const a = new StubWire();
    const b = new StubWire();
    a.peer = b;
    b.peer = a;
    return [a, b,];
  }

  class StubWire {
    peer: StubWire | null = null;
    private readonly dataListeners: ((chunk: Buffer,) => void)[] = [];
    private readonly closeListeners: ((arg?: unknown,) => void)[] = [];

    on(event: "data", listener: (chunk: Buffer,) => void,): unknown {
      if (event === "data") { this.dataListeners.push(listener,); }
      return this;
    }

    off(event: "data", listener: (chunk: Buffer,) => void,): unknown {
      if (event === "data") {
        const at = this.dataListeners.indexOf(listener,);
        if (at !== -1) { this.dataListeners.splice(at, 1,); }
      }

      return this;
    }

    once(_event: "close" | "error", listener: (arg?: unknown,) => void,): unknown {
      const wrapped = (arg?: unknown,): void => {
        const at = this.closeListeners.indexOf(wrapped,);
        if (at !== -1) { this.closeListeners.splice(at, 1,); }
        listener(arg,);
      };

      this.closeListeners.push(wrapped,);
      return this;
    }

    write(chunk: string, cb?: (err?: Error,) => void,): boolean {
      this.peer?.receive(chunk,);
      cb?.();
      return true;
    }

    destroy(): unknown {
      for (const listener of [...this.closeListeners,]) { listener(); }
      return this;
    }

    /** Deliver a written chunk to this side's data listeners. */
    private receive(chunk: string,): void {
      for (const listener of [...this.dataListeners,]) { listener(Buffer.from(chunk,),); }
    }
  }

  test("a message sent on one side arrives parsed on the other", async () => {
    const [a, b,] = linkedPair();
    const ta = new SocketProxyTransport(a,);
    const tb = new SocketProxyTransport(b,);
    const received: JSONRPCMessage[] = [];
    tb.onmessage = (message,) => {
      received.push(message,);
    };

    await ta.start();
    await tb.start();
    await ta.send({ jsonrpc: "2.0", id: 1, method: "ping", },);
    await tb.send({ jsonrpc: "2.0", id: 1, result: {}, },);
    expect(received,).toEqual([{ jsonrpc: "2.0", id: 1, method: "ping", },],);
    await ta.close();
    await tb.close();
  });

  test("leftover handshake bytes replay after connect without loss", async () => {
    const [a, b,] = linkedPair();
    const ta = new SocketProxyTransport(a,);
    const tb = new SocketProxyTransport(b,);
    const received: JSONRPCMessage[] = [];
    tb.onmessage = (message,) => {
      received.push(message,);
    };

    await ta.start();
    await tb.start();
    // Bytes that arrived with the handshake chunk, replayed post-connect
    // (SDK stdio framing is line-delimited JSON — same as serializeMessage).
    const leftoverBody = JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping", },);
    tb.feed(Buffer.from(`${leftoverBody}\n`,),);
    expect(received,).toEqual([{ jsonrpc: "2.0", id: 7, method: "ping", },],);
    await ta.close();
    await tb.close();
  });
});

describe("stdio-proxy listener", () => {
  let env: Record<string, string>;
  let dir: string;
  let listeners: StdioProxyListener[];

  const seed = (scope: "read" | "chat-write" = "chat-write",): void => {
    initInboundSettings({
      mcpEnabled: true,
      acpEnabled: true,
      principalUserId: USER,
      principalScope: scope,
      proxyBind: "127.0.0.1",
    },);
  };

  /** Connect + handshake; resolves the socket past its ack line. */
  async function handshake(
    listener: StdioProxyListener,
    protocol: "mcp" | "acp",
    token: string,
  ): Promise<{ socket: Socket; rest: Buffer }> {
    const socket = connect(listener.port, listener.host,);
    const { promise, resolve, } = Promise.withResolvers<void>();
    socket.once("connect", () => resolve(),);
    await promise;
    socket.write(encodeProxyHandshake({ protocol, token, },),);
    const first = await readSocketLine(socket,);
    expect(first,).not.toBeNull();
    if (first === null) { throw new Error("no ack line",); }
    expect(decodeProxyAck(first.line,),).toEqual({ ok: true, },);
    return { socket, rest: first.rest, };
  }

  /** Audit rows for one refused/accepted proxy connection. */
  async function auditFor(op: string,): Promise<{ message: string; meta: Record<string, unknown> }[]> {
    const rows = await db.selectFrom("log_entries",).select(["message", "meta",],).where("action", "=", op,).execute();
    return rows.map((row,) => ({
      message: row.message ?? "",
      meta: JSON.parse((row.meta ?? "{}") as string,) as Record<string, unknown>,
    }));
  }

  beforeEach(() => {
    const fresh = tempEnv();
    env = fresh.env;
    dir = fresh.dir;
    listeners = [];
    seed();
  },);

  afterEach(async () => {
    for (const listener of listeners) { await listener.close(); }
    rmSync(dir, { recursive: true, force: true, },);
  },);

  test("bad token is rejected + audited; the listener keeps serving", async () => {
    const token = ensureProxyToken(env,);
    const listener = await startStdioProxyListener({ database: db, config: baseConfig, }, env,);
    listeners.push(listener,);

    const bad = connect(listener.port, listener.host,);
    const { promise, resolve, } = Promise.withResolvers<void>();
    bad.once("connect", () => resolve(),);
    await promise;
    bad.write(encodeProxyHandshake({ protocol: "mcp", token: "wrong", },),);
    const first = await readSocketLine(bad,);
    expect(first,).not.toBeNull();
    expect(decodeProxyAck(first?.line ?? "",),).toEqual({
      ok: false,
      error: "unauthorized: bad or missing proxy token",
    },);

    bad.destroy();

    const rows = await auditFor("proxy.connect",);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.meta["status"],).toBe(401,);

    // The refusal ended one connection; a good handshake still works.
    const { socket, } = await handshake(listener, "mcp", token,);
    socket.destroy();
  });

  test("missing token file is rejected + audited", async () => {
    ensureProxyToken(env,);
    const listener = await startStdioProxyListener({ database: db, config: baseConfig, }, env,);
    listeners.push(listener,);
    unlinkSync(proxyTokenPath(env,),);

    const missing = connect(listener.port, listener.host,);
    const { promise, resolve, } = Promise.withResolvers<void>();
    missing.once("connect", () => resolve(),);
    await promise;
    missing.write(encodeProxyHandshake({ protocol: "acp", token: "anything", },),);
    const first = await readSocketLine(missing,);
    expect(decodeProxyAck(first?.line ?? "",)?.ok,).toBe(false,);
    missing.destroy();

    const rows = await auditFor("proxy.connect",);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.meta["status"],).toBe(401,);
  });

  test("EOF before and after the handshake never stops the server", async () => {
    const token = ensureProxyToken(env,);
    const listener = await startStdioProxyListener({ database: db, config: baseConfig, }, env,);
    listeners.push(listener,);

    // EOF mid-handshake: connect and vanish without a line.
    const silent = connect(listener.port, listener.host,);
    const { promise: connected, resolve: markConnected, } = Promise.withResolvers<void>();
    silent.once("connect", () => markConnected(),);
    await connected;
    silent.destroy();

    // EOF after a good handshake: the relay's normal end.
    const first = await handshake(listener, "mcp", token,);
    first.socket.destroy();

    // The listener still serves: a full MCP tools/list round-trip.
    const { socket, rest, } = await handshake(listener, "mcp", token,);
    const transport = new SocketProxyTransport(socket,);
    const client = new Client({ name: "proxy-eof-test", version: "0.0.0", },);
    await client.connect(transport,);
    if (rest.length > 0) { transport.feed(rest,); }
    const tools = await client.listTools();
    expect(tools.tools.length,).toBeGreaterThan(0,);
    await client.close();
  });

  test("a proxied MCP op runs the server lifecycle and is audited like a local turn", async () => {
    const token = ensureProxyToken(env,);
    const listener = await startStdioProxyListener({ database: db, config: baseConfig, }, env,);
    listeners.push(listener,);

    const { socket, rest, } = await handshake(listener, "mcp", token,);
    const transport = new SocketProxyTransport(socket,);
    const client = new Client({ name: "proxy-mcp-test", version: "0.0.0", },);
    await client.connect(transport,);
    if (rest.length > 0) { transport.feed(rest,); }
    const tools = await client.listTools();
    expect(tools.tools.map((tool,) => tool.name),).toContain("chat.history",);
    const result = await client.callTool({ name: "chat.history", arguments: { chatId: CHAT, }, },);
    expect(result.isError,).not.toBe(true,);
    await client.close();

    const rows = await auditFor("chat.history",);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.message,).toBe("facade chat.history -> 200",);
    expect(rows[0]?.meta["principalKind"],).toBe("external-agent",);
  });

  test("a proxied ACP prompt persists the turn through the DB-backed op", async () => {
    const token = ensureProxyToken(env,);
    const listener = await startStdioProxyListener({ database: db, config: baseConfig, }, env,);
    listeners.push(listener,);

    const { socket, } = await handshake(listener, "acp", token,);
    const sink: string[] = [];
    readLines(socket, sink,);
    const send = (message: unknown,): void => {
      socket.write(`${JSON.stringify(message,)}\n`,);
    };

    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {}, },);
    expect(JSON.parse(await nextLine(sink,),) as unknown,).toMatchObject({ jsonrpc: "2.0", id: 1, },);
    send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { chatId: CHAT, }, },);
    const created = JSON.parse(await nextLine(sink,),) as { result?: { sessionId?: string } };
    const sessionId = created.result?.sessionId;
    expect(typeof sessionId,).toBe("string",);
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: "hello via proxy", },], },
    },);

    // The reply chunk (session/update notification) then the prompt result.
    const update = JSON.parse(await nextLine(sink,),) as { method?: string };
    expect(update.method,).toBe("session/update",);
    const prompted = JSON.parse(await nextLine(sink,),) as { result?: { stopReason?: string } };
    expect(prompted.result?.stopReason,).toBe("end_turn",);
    socket.destroy();

    const rows = await auditFor("chat.send",);
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.message,).toBe("facade chat.send -> 201",);
  });

  test("a non-loopback bind is refused without TLS+token", async () => {
    await expect(startStdioProxyListener({ database: db, config: baseConfig, host: "0.0.0.0", }, env,),).rejects
      .toThrow("non-loopback",);
  });
});

describe("runStdioProxyRelay", () => {
  test("relays bytes both ways against a stub server and exits 0 on EOF", async () => {
    const { env, dir, } = tempEnv();
    try {
      const token = ensureProxyToken(env,);
      const server = createServer((socket,) => {
        void readSocketLine(socket,).then((first,) => {
          if (first === null) {
            socket.destroy();
            return;
          }

          const handshake = decodeProxyHandshake(first.line,);
          if (handshake === null || handshake.token !== token) {
            socket.write(encodeProxyAck(false, "nope",),);
            socket.destroy();
            return;
          }

          socket.write(encodeProxyAck(true,),);
          socket.on("data", (chunk: Buffer,) => {
            socket.write(chunk,);
          },);
        },);
      },);

      const { promise: listening, resolve: markListening, } = Promise.withResolvers<void>();
      server.listen(0, "127.0.0.1", () => markListening(),);
      await listening;
      const info = server.address();
      if (typeof info !== "object" || info === null) { throw new Error("stub server has no address",); }
      const addr = `127.0.0.1:${info.port}`;

      const input = new PassThrough();
      const output = new PassThrough();
      const chunks: Buffer[] = [];
      output.on("data", (chunk: Buffer,) => {
        chunks.push(chunk,);
      },);

      const relay = runStdioProxyRelay({ input, output, addr, token, protocol: "mcp", },);
      input.write("hello-proxy",);
      input.end();
      expect(await relay,).toBe(0,);
      expect(Buffer.concat(chunks,).toString("utf8",),).toBe("hello-proxy",);
      server.close();
    } finally {
      rmSync(dir, { recursive: true, force: true, },);
    }
  });

  test("an unusable address resolves 1 without throwing", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    input.end();
    expect(await runStdioProxyRelay({ input, output, addr: "not-an-addr", token: "t", protocol: "acp", },),).toBe(1,);
  });
});
