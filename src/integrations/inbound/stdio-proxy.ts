// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-proxy.ts — Design B stdio shim, shared + client half.
 *
 * The running server gains a local-only TCP listener
 * (`stdio-proxy-listener.ts`); the MCP/ACP stdio mains gain a `--proxy`
 * mode that runs HERE: the thin process owns stdio and relays bytes to the
 * listener instead of opening the database itself. One protocol per spawned
 * process (the `--proxy` flag selects `mcp` or `acp` framing by which main
 * was spawned) — no multiplexed MCP+ACP on one fd.
 *
 * Wire shape per connection: the shim sends one JSON handshake line
 * (`{"protocol","token"}`), the server answers one JSON ack line
 * (`{"ok"}`), then raw protocol bytes flow both ways. The token lives in
 * `$STATE/<instance>/stdio-proxy.token` (0600); the server writes its
 * `host:port` to `$STATE/<instance>/stdio-proxy.addr` so `--proxy` without
 * an address finds it.
 *
 * Never-stop semantics: stdio EOF/close ends ONLY this relay — the server
 * never reads process.stdin and the listener survives every disconnect.
 */

import { randomBytes, timingSafeEqual, } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import { connect, type Socket, } from "node:net";
import { dirname, join, } from "node:path";
import type { Config, } from "../../config/schema";
import { resolveInstanceDir, type StateEnv, } from "../../config/state-dir";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";

/** Token file name inside the instance dir. SECRET — owner-only. */
export const STDIO_PROXY_TOKEN_FILE = "stdio-proxy.token";

/** Listener address file name inside the instance dir (not secret). */
export const STDIO_PROXY_ADDR_FILE = "stdio-proxy.addr";

/** Largest handshake/ack line accepted before the connection is refused. */
export const STDIO_PROXY_LINE_MAX_BYTES = 4096;

/** How long the handshake/ack line may take before the attempt fails. */
export const STDIO_PROXY_LINE_TIMEOUT_MS = 5000;

/** Bind default: loopback-only. Remote bind is a future ticket. */
export const STDIO_PROXY_LOOPBACK_DEFAULT = "127.0.0.1";

/** Which protocol a proxied connection speaks (one per spawned shim). */
export type StdioProxyProtocol = "mcp" | "acp";

/** First line the shim sends: protocol selection + bearer token. */
export interface StdioProxyHandshake {
  protocol: StdioProxyProtocol;
  token: string;
}

/**
 * @param env - environment to resolve the instance dir from
 * @returns the token file path for this instance
 */
export function proxyTokenPath(env: StateEnv = process.env,): string {
  return join(resolveInstanceDir(env,), STDIO_PROXY_TOKEN_FILE,);
}

/**
 * @param env - environment to resolve the instance dir from
 * @returns the listener address file path for this instance
 */
export function proxyAddrPath(env: StateEnv = process.env,): string {
  return join(resolveInstanceDir(env,), STDIO_PROXY_ADDR_FILE,);
}

/**
 * Read the proxy token, generating it (0600) on first boot. An existing
 * file with group/other bits is chmodded back to owner-only.
 * @param env - environment to resolve the instance dir from
 * @returns the token, never empty
 */
export function ensureProxyToken(env: StateEnv = process.env,): string {
  const path = proxyTokenPath(env,);
  mkdirSync(dirname(path,), { recursive: true, },);
  if (existsSync(path,)) {
    const raw = readFileSync(path, "utf8",).trim();
    if (raw !== "") {
      if ((statSync(path,).mode & 0o777 & 0o077) !== 0) { chmodSync(path, 0o600,); }
      return raw;
    }
  }

  const token = randomBytes(32,).toString("base64url",);
  writeFileSync(path, `${token}\n`, { mode: 0o600, },);
  chmodSync(path, 0o600,);
  return token;
}

/**
 * @param env - environment to resolve the instance dir from
 * @returns the stored token, or null when the server never wrote one
 */
export function readProxyToken(env: StateEnv = process.env,): string | null {
  const path = proxyTokenPath(env,);
  if (!existsSync(path,)) { return null; }
  const raw = readFileSync(path, "utf8",).trim();
  return raw === "" ? null : raw;
}

/**
 * @param addr - `host:port` the listener bound
 * @param env - environment to resolve the instance dir from
 */
export function writeProxyAddr(addr: string, env: StateEnv = process.env,): void {
  const path = proxyAddrPath(env,);
  mkdirSync(dirname(path,), { recursive: true, },);
  writeFileSync(path, `${addr.trim()}\n`,);
}

/**
 * @param env - environment to resolve the instance dir from
 * @returns the stored listener address, or null when not running
 */
export function readProxyAddr(env: StateEnv = process.env,): string | null {
  const path = proxyAddrPath(env,);
  if (!existsSync(path,)) { return null; }
  const raw = readFileSync(path, "utf8",).trim();
  return raw === "" ? null : raw;
}

/**
 * @param host - configured bind host
 * @returns true for loopback-only binds (v4, v6, or the name)
 */
export function isLoopbackHost(host: string,): boolean {
  const h = host.trim().toLowerCase();
  return h === "127.0.0.1" || h === "::1" || h === "localhost";
}

/**
 * @param config - app config
 * @returns the configured proxy bind, defaulting to loopback-only
 */
export function resolveProxyBind(config: Config,): string {
  return config.integrations?.inbound?.proxyBind ?? STDIO_PROXY_LOOPBACK_DEFAULT;
}

/**
 * @param handshake - the shim's handshake
 * @returns the handshake as one `\n`-terminated line
 */
export function encodeProxyHandshake(handshake: StdioProxyHandshake,): string {
  return `${jsonStringifyOr(handshake, "{}",)}\n`;
}

/**
 * @param line - one handshake line without the newline
 * @returns the handshake, or null when malformed
 */
export function decodeProxyHandshake(line: string,): StdioProxyHandshake | null {
  const parsed: unknown = jsonParseOr(line, null,);

  if (typeof parsed !== "object" || parsed === null) { return null; }
  const record = parsed as Record<string, unknown>;
  if (record["protocol"] !== "mcp" && record["protocol"] !== "acp") { return null; }
  if (typeof record["token"] !== "string" || record["token"] === "") { return null; }
  return { protocol: record["protocol"], token: record["token"], };
}

/**
 * @param ok - whether the connection is accepted
 * @param error - refusal reason (refusals only; never the token)
 * @returns the ack as one `\n`-terminated line
 */
export function encodeProxyAck(ok: boolean, error?: string,): string {
  return `${jsonStringifyOr(error === undefined ? { ok, } : { ok, error, }, "{}",)}\n`;
}

/**
 * @param line - one ack line without the newline
 * @returns the ack, or null when malformed
 */
export function decodeProxyAck(line: string,): { ok: boolean; error?: string } | null {
  const parsed: unknown = jsonParseOr(line, null,);

  if (typeof parsed !== "object" || parsed === null) { return null; }
  const record = parsed as Record<string, unknown>;
  if (typeof record["ok"] !== "boolean") { return null; }
  if (record["error"] !== undefined && typeof record["error"] !== "string") { return null; }
  return record["error"] === undefined ? { ok: record["ok"], } : { ok: record["ok"], error: record["error"], };
}

/**
 * Constant-time bearer comparison (length-checked first; the length is not
 * secret — every token minted here is 43 chars).
 * @param candidate - token the shim presented
 * @param expected - token the server minted
 */
export function verifyProxyToken(candidate: string, expected: string,): boolean {
  const a = Buffer.from(candidate,);
  const b = Buffer.from(expected,);
  return a.length === b.length && timingSafeEqual(a, b,);
}

/**
 * Parse `--proxy [addr]` from a stdio main's argv.
 * @param argv - process argv (including the executable and script entries)
 * @returns undefined when absent; "" for a bare `--proxy` (addr file); else
 *   the explicit `host:port`
 */
export function parseProxyAddr(argv: string[],): string | undefined {
  const at = argv.indexOf("--proxy",);
  if (at === -1) { return undefined; }
  const next = argv[at + 1];
  return next !== undefined && !next.startsWith("-",) ? next : "";
}

/**
 * @param addr - `host:port` (v6 hosts bracketed: `[::1]:4123`)
 * @returns the split target
 * @throws {Error} when the address is not a usable `host:port`
 */
export function parseProxyTarget(addr: string,): { host: string; port: number } {
  const at = addr.lastIndexOf(":",);
  const host = (at === -1 ? "" : addr.slice(0, at,)).trim().replace(/^\[(.*)\]$/, "$1",);
  const port = Number(at === -1 ? "" : addr.slice(at + 1,),);
  if (host === "" || !Number.isInteger(port,) || port < 1 || port > 65535) {
    throw new Error(`stdio proxy address must be host:port, got "${addr}"`,);
  }

  return { host, port, };
}

/**
 * Resolve what a `--proxy` shim needs: the listener address (explicit flag
 * wins, else the server-written addr file) and the bearer token.
 * @param addrArg - parseProxyAddr's result ("" reads the addr file)
 * @param env - environment to resolve the instance dir from
 * @returns the relay target
 * @throws {Error} with an actionable message when either is missing
 */
export function resolveProxyClient(addrArg: string, env: StateEnv = process.env,): {
  addr: string;
  token: string;
} {
  const addr = addrArg !== "" ? addrArg : readProxyAddr(env,);
  if (addr === null || addr === "") {
    throw new Error(
      "stdio proxy address unknown: pass --proxy <host:port> or start the server (it writes its listener address next to the state dir)",
    );
  }

  const token = readProxyToken(env,);
  if (token === null) {
    throw new Error(
      "stdio proxy token missing: the server mints it at boot — is the server running with an inbound server enabled?",
    );
  }

  return { addr, token, };
}

/**
 * Read one `\n`-terminated line, handing the bytes after it back so the
 * protocol stage starts mid-chunk with nothing lost.
 * @param socket - the connected socket (listener or relay side)
 * @param maxBytes - line cap; larger lines resolve null (refused)
 * @param timeoutMs - line deadline; expiry resolves null
 * @returns the line (no newline) plus the trailing bytes, or null
 */
export function readSocketLine(
  socket: Socket,
  maxBytes = STDIO_PROXY_LINE_MAX_BYTES,
  timeoutMs = STDIO_PROXY_LINE_TIMEOUT_MS,
): Promise<{ line: string; rest: Buffer } | null> {
  const { promise, resolve, } = Promise.withResolvers<{ line: string; rest: Buffer } | null>();
  let buffer = Buffer.alloc(0,);
  let settled = false;
  const finish = (value: { line: string; rest: Buffer } | null,): void => {
    if (settled) { return; }
    settled = true;
    clearTimeout(timer,);
    socket.off("data", onData,);
    socket.off("error", onError,);
    socket.off("close", onClose,);
    resolve(value,);
  };

  const timer = setTimeout(() => finish(null,), timeoutMs,);
  const onData = (chunk: Buffer,): void => {
    buffer = Buffer.concat([buffer, chunk,],);
    if (buffer.length > maxBytes) {
      finish(null,);
      return;
    }

    const at = buffer.indexOf(0x0a,);
    if (at !== -1) {
      finish({ line: buffer.subarray(0, at,).toString("utf8",), rest: buffer.subarray(at + 1,), },);
    }
  };

  const onError = (): void => {
    finish(null,);
  };

  const onClose = (): void => {
    finish(null,);
  };

  socket.on("data", onData,);
  socket.once("error", onError,);
  socket.once("close", onClose,);
  return promise;
}

/** Narrowest pipe seams: real stdio, sockets, and PassThroughs all fit. */
export interface ProxyPipeSource {
  on(event: "data", listener: (chunk: Buffer,) => void,): unknown;
  off(event: "data", listener: (chunk: Buffer,) => void,): unknown;
  pause(): unknown;
  resume(): unknown;
  once(event: "end", listener: () => void,): unknown;
}

/** Narrowest pipe seams: real stdio, sockets, and PassThroughs all fit. */
export interface ProxyPipeSink {
  write(chunk: Uint8Array | string,): boolean;
  once(event: "drain", listener: () => void,): unknown;
}

/** Pipe bytes with backpressure; the source pauses while the sink is full. */
function pipeWithBackpressure(src: ProxyPipeSource, dst: ProxyPipeSink,): void {
  const onData = (chunk: Buffer,): void => {
    if (!dst.write(chunk,)) { src.pause(); }
  };

  dst.once("drain", () => {
    src.resume();
  },);

  src.on("data", onData,);
}

/**
 * The shim's main loop: connect, handshake, ack, then relay stdio both ways
 * until the far end closes. Resolves (never throws, never exits) so the
 * mains map the outcome to an exit code in one place.
 * @param opts - stdio streams, listener address, token, and protocol
 * @returns 0 on a clean relay (EOF either side), 1 when the relay failed
 */
export function runStdioProxyRelay(opts: {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  addr: string;
  token: string;
  protocol: StdioProxyProtocol;
},): Promise<number> {
  const { promise, resolve, } = Promise.withResolvers<number>();
  let target: { host: string; port: number };
  try {
    target = parseProxyTarget(opts.addr,);
  } catch {
    resolve(1,);
    return promise;
  }

  let settled = false;
  // Declared before connect: the error handler below closes over it.
  let socket: Socket;
  const done = (code: number,): void => {
    if (settled) { return; }
    settled = true;
    try {
      socket.destroy();
    } catch {
      /* already gone */
    }

    resolve(code,);
  };

  socket = connect(target.port, target.host,);
  socket.once("error", () => done(1,),);
  socket.once("connect", () => {
    socket.write(encodeProxyHandshake({ protocol: opts.protocol, token: opts.token, },),);
    void readSocketLine(socket,).then((first,) => {
      if (first === null) {
        done(1,);
        return;
      }

      const ack = decodeProxyAck(first.line,);
      if (ack === null || !ack.ok) {
        done(1,);
        return;
      }

      // The ack may share a chunk with protocol bytes — replay them.
      if (first.rest.length > 0) { opts.output.write(first.rest,); }
      pipeWithBackpressure(opts.input as unknown as ProxyPipeSource, socket as unknown as ProxyPipeSink,);
      pipeWithBackpressure(socket as unknown as ProxyPipeSource, opts.output as unknown as ProxyPipeSink,);
      (opts.input as unknown as ProxyPipeSource).once("end", () => {
        socket.end();
      },);

      socket.once("end", () => done(0,),);
      socket.once("close", () => done(0,),);
    },);
  },);

  return promise;
}
