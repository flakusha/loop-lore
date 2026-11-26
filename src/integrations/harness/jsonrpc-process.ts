// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 300

/**
 * Minimal JSON-RPC 2.0 client over a child process's stdio, framed as
 * newline-delimited JSON (the framing the vendored ACP transport uses,
 * oh-my-pi packages/utils/src/acp/stream.ts `ndJsonStream`). One process per
 * instance; requests are correlated by id; failures reject as
 * JsonRpcRequestError on error payloads, timeouts, or a closed process.
 */

import { type ChildProcessWithoutNullStreams, spawn, } from "node:child_process";
import { getChildLogger, } from "../../logger";
import { safeJsonParse, safeJsonStringify, } from "../../utils";
import { scrubEnv, } from "./env-scrub";

/**
 * Upper bound on one unterminated child stdout line. A child that never sends
 * a newline must not grow this process without limit.
 */
export const MAX_JSONRPC_LINE_BYTES = 1 << 20;

/**
 * Bounded tail kept from child stderr. stderr is piped (never inherited) so a
 * chatty agent cannot pollute the server's own diagnostics; it must still be
 * DRAINED or ~64 KiB of output blocks the child and stalls every flavor.
 */
export const MAX_STDERR_TAIL_BYTES = 8 * 1024;
/** One logged stderr line never exceeds this many characters. */
const MAX_STDERR_LOG_CHARS = 512;

/** Options for the connection. */
export interface JsonRpcProcessOptions {
  /** Spawn argv. */
  command: string[];
  /** Working directory passed to the child. */
  cwd?: string;
  /** Per-request timeout in ms (default 120000). */
  requestTimeoutMs?: number;
  /** Called when the child exits (spawn failure or close). */
  onExit?: (detail: string,) => void;
  /** Called for inbound JSON-RPC notifications (no id). */
  onNotification?: (method: string, params: unknown,) => void;
  /**
   * Serves server-originated requests (a numeric id the client never sent).
   * The resolved value becomes the success result; a rejection becomes an
   * error payload (code preserved from {@link JsonRpcRequestError}, else
   * -32603). Without a handler every server request answers -32601.
   */
  onRequest?: (method: string, params: unknown,) => Promise<unknown>;
}

/** A JSON-RPC error payload surfaced as an exception value. */
export class JsonRpcRequestError extends Error {
  /** JSON-RPC error code, when the peer answered with an error. */
  readonly code?: number;
  /** JSON-RPC error data, when present. */
  readonly data?: unknown;

  /**
   * @param message - error text
   * @param code - JSON-RPC error code
   * @param data - error data payload
   */
  constructor(message: string, code?: number, data?: unknown,) {
    super(message,);
    this.name = "JsonRpcRequestError";
    this.code = code;
    this.data = data;
  }
}

/** JSON-RPC error code for a request cancelled via `$/cancel_request` (LSP §5.1). */
export const JSON_RPC_CANCELLED_CODE = -32800;

/** A pending request cancelled by id — the transport stays usable. */
export class JsonRpcRequestCancelledError extends JsonRpcRequestError {
  /**
   * @param message - cancellation detail
   * @param data - optional cancellation data
   */
  constructor(message = "request cancelled", data?: unknown,) {
    super(message, JSON_RPC_CANCELLED_CODE, data,);
    this.name = "JsonRpcRequestCancelledError";
  }
}

/** Pending request bookkeeping. */
interface PendingEntry {
  resolve: (v: unknown,) => void;
  reject: (e: Error,) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** */
export class JsonRpcProcess {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingEntry>();
  private buffer = "";
  /** Bounded tail of the child's stderr, newest bytes last. */
  private stderrTailBuffer = Buffer.alloc(0,);
  private closed = false;
  private readonly opts: Required<Pick<JsonRpcProcessOptions, "requestTimeoutMs">> & JsonRpcProcessOptions;

  /**
   * @param options - spawn argv, cwd, timeouts, exit hook
   * @throws {JsonRpcRequestError} never — spawn failures surface on request
   */
  constructor(options: JsonRpcProcessOptions,) {
    this.opts = { ...options, requestTimeoutMs: options.requestTimeoutMs ?? 120_000, };
    this.spawnChild();
  }

  /**
   * Send one request and await its response.
   * @param method - wire method name (verified casing per ACP protocol)
   * @param params - request params object
   * @returns the `result` payload.
   * @throws {JsonRpcRequestError} on error payload, timeout, or closed process
   */
  request(method: string, params: Record<string, unknown>,): Promise<unknown> {
    if (this.closed || !this.child) {
      return Promise.reject(new JsonRpcRequestError("connection closed",),);
    }

    const id = this.nextId++;
    const serialized = safeJsonStringify({ jsonrpc: "2.0", id, method, params, },);
    if (!serialized.ok) {
      return Promise.reject(new JsonRpcRequestError("unserializable request",),);
    }

    const message = serialized.value;
    return new Promise<unknown>((resolve, reject,) => {
      const timer = setTimeout(() => {
        this.pending.delete(id,);
        reject(new JsonRpcRequestError(`request ${method} timed out`,),);
      }, this.opts.requestTimeoutMs,);

      this.pending.set(id, { resolve, reject, timer, },);
      this.child!.stdin.write(message + "\n", (err,) => {
        if (err) {
          clearTimeout(timer,);
          this.pending.delete(id,);
          reject(new JsonRpcRequestError(`write failed: ${err.message}`,),);
        }
      },);
    },);
  }

  /**
   * Send a notification — no id, no response tracked.
   * @param method - wire method name (verified casing per ACP protocol)
   * @param params - notification params object
   */
  notify(method: string, params: Record<string, unknown>,): void {
    this.write({ jsonrpc: "2.0", method, params, },);
  }

  /** The ids of requests still awaiting a response (introspection for cancellation). */
  pendingIds(): number[] {
    return [...this.pending.keys(),];
  }

  /**
   * The bounded stderr tail, for diagnostics after a child misbehaves.
   * @returns at most {@link MAX_STDERR_TAIL_BYTES} bytes of stderr text.
   */
  stderrTail(): string {
    return this.stderrTailBuffer.toString("utf8",);
  }

  /**
   * Cancel one pending request by id: its promise rejects with a typed
   * {@link JsonRpcRequestCancelledError} and a `$/cancel_request`
   * notification goes on the wire so the peer drops the work too. Any other
   * pending request is untouched and the transport stays usable.
   * @param id - the request id to cancel
   * @returns true when a pending request was cancelled.
   */
  cancelRequest(id: number,): boolean {
    if (!this.cancelPending(id,)) { return false; }
    this.write({ jsonrpc: "2.0", method: "$/cancel_request", params: { id, }, },);
    return true;
  }

  /**
   * Reject one pending request with the typed cancellation error.
   * @param id - the pending request id
   * @returns true when a pending request was cancelled.
   */
  private cancelPending(id: number,): boolean {
    const p = this.pending.get(id,);
    if (!p) { return false; }
    this.pending.delete(id,);
    clearTimeout(p.timer,);
    p.reject(new JsonRpcRequestCancelledError(`request ${id} cancelled`,),);
    return true;
  }

  /** Write one raw wire object; a dead pipe or unserializable payload tears the transport down via `onExit`. */
  private write(msg: Record<string, unknown>,): void {
    const serialized = safeJsonStringify(msg,);
    if (!serialized.ok) {
      this.failAll(`unserializable outbound message: ${serialized.error}`,);
      this.opts.onExit?.(`unserializable outbound message: ${serialized.error}`,);
      return;
    }

    this.child?.stdin.write(serialized.value + "\n", (err,) => {
      if (err) {
        this.failAll(`write failed: ${err.message}`,);
        this.opts.onExit?.(`write failed: ${err.message}`,);
      }
    },);
  }

  /**
   * Kill the child and fail all pending requests.
   */
  close(): void {
    if (this.closed) { return; }
    this.closed = true;
    this.failAll("connection closed",);
    this.child?.kill();
  }

  /**
   * Reject every pending request (child exited or fatal error).
   * @param detail - reason surfaced in each rejection
   */
  private failAll(detail: string,): void {
    for (const [, p,] of this.pending) {
      clearTimeout(p.timer,);
      p.reject(new JsonRpcRequestError(detail,),);
    }

    this.pending.clear();
    this.child = null;
  }

  /** Tear the transport down when the child emits an overlong line. */
  private failOversizedLine(): void {
    if (this.closed) { return; }
    this.closed = true;
    this.buffer = "";
    const child = this.child;
    const detail = `child stdout line exceeds ${MAX_JSONRPC_LINE_BYTES} bytes`;
    this.failAll(detail,);
    child?.kill();
    this.opts.onExit?.(detail,);
  }

  /** Spawn the child and wire stdio handlers. */
  private spawnChild(): void {
    const [cmd, ...args] = this.opts.command;
    if (!cmd) {
      // Deferred failure: remember and surface on the first request.
      this.closed = true;
      this.opts.onExit?.("empty command",);
      return;
    }

    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(cmd, args, { cwd: this.opts.cwd, stdio: ["pipe", "pipe", "pipe",], env: scrubEnv(), },);
    } catch (error) {
      this.closed = true;
      this.opts.onExit?.((error as Error).message,);
      return;
    }

    this.child = child;

    // Drain stderr unconditionally: a full pipe blocks the child even when
    // nobody reads the diagnostics. Keep only a bounded tail and one bounded
    // log line per chunk.
    child.stderr.on("data", (chunk: Buffer,) => {
      const merged = Buffer.concat([this.stderrTailBuffer, chunk,],);
      this.stderrTailBuffer = merged.length > MAX_STDERR_TAIL_BYTES
        ? merged.subarray(merged.length - MAX_STDERR_TAIL_BYTES,)
        : merged;

      const text = chunk.toString("utf8",).trim();
      if (text.length > 0) {
        getChildLogger("harness-acp",)?.warn("harness child stderr", {
          text: text.slice(0, MAX_STDERR_LOG_CHARS,),
        },);
      }
    },);

    child.stdout.setEncoding("utf8",);
    child.stdout.on("data", (chunk: string,) => {
      if (this.closed) { return; }
      this.buffer += chunk;
      let newline = this.buffer.indexOf("\n",);
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline,).trimEnd();
        this.buffer = this.buffer.slice(newline + 1,);

        if (Buffer.byteLength(line, "utf8",) > MAX_JSONRPC_LINE_BYTES) {
          this.failOversizedLine();
          return;
        }

        if (line.length > 0) { this.handleLine(line,); }
        newline = this.buffer.indexOf("\n",);
      }

      if (Buffer.byteLength(this.buffer, "utf8",) > MAX_JSONRPC_LINE_BYTES) {
        this.failOversizedLine();
      }
    },);

    child.on("error", (err,) => {
      this.failAll(`child error: ${err.message}`,);
      this.opts.onExit?.(err.message,);
    },);

    child.on("exit", (code, signal,) => {
      this.failAll(`child exited code=${code ?? "null"} signal=${signal ?? "null"}`,);
      this.opts.onExit?.(`exited code=${code ?? "null"} signal=${signal ?? "null"}`,);
    },);
  }

  /**
   * Parse and dispatch one NDJSON line.
   * @param line - one JSON-RPC message
   */
  private handleLine(line: string,): void {
    let msg: {
      id?: unknown;
      method?: unknown;
      params?: unknown;
      result?: unknown;
      error?: { code?: number; message?: string; data?: unknown };
    };

    try {
      const parsed = safeJsonParse<typeof msg>(line,);
      if (!parsed.ok) { return; }
      msg = parsed.value;
    } catch {
      return; // Non-JSON noise (banner output) is dropped, not fatal.
    }

    if (typeof msg.id !== "number") {
      if (typeof msg.method === "string") {
        // A peer `$/cancel_request` cancels OUR pending request by id: reject
        // it with the typed cancellation error without tearing down the
        // transport (and without echoing a cancel back — that would loop).
        if (msg.method === "$/cancel_request") {
          const cancelId = (msg.params as { id?: unknown } | null)?.id;
          if (typeof cancelId === "number") { this.cancelPending(cancelId,); }

          return;
        }

        this.opts.onNotification?.(msg.method, msg.params,);
      }

      return;
    }

    const p = this.pending.get(msg.id,);
    if (!p) {
      if (typeof msg.method === "string") {
        this.handleServerRequest(msg.id, msg.method, msg.params,);
      }

      return;
    }

    this.pending.delete(msg.id,);
    clearTimeout(p.timer,);
    if (msg.error) {
      p.reject(new JsonRpcRequestError(msg.error.message ?? "json-rpc error", msg.error.code, msg.error.data,),);
    } else {
      p.resolve(msg.result,);
    }
  }

  /** Answer a server-originated request through the `onRequest` handler. */
  private handleServerRequest(id: number, method: string, params: unknown,): void {
    const handler = this.opts.onRequest;
    if (!handler) {
      this.write({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}`, }, },);
      return;
    }

    Promise.resolve(handler(method, params,),).then(
      (result,) => {
        this.write({ jsonrpc: "2.0", id, result, },);
      },
      (cause: unknown,) => {
        const code = cause instanceof JsonRpcRequestError && typeof cause.code === "number" ? cause.code : -32603;
        const message = cause instanceof Error ? cause.message : "internal error";
        this.write({ jsonrpc: "2.0", id, error: { code, message, }, },);
      },
    );
  }
}
