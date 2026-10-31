// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Minimal JSON-RPC 2.0 client over a child process's stdio, framed as
 * newline-delimited JSON (the framing the vendored ACP transport uses,
 * oh-my-pi packages/utils/src/acp/stream.ts `ndJsonStream`). One process per
 * instance; requests are correlated by id; failures reject as
 * JsonRpcRequestError on error payloads, timeouts, or a closed process.
 */

import { type ChildProcessWithoutNullStreams, spawn, } from "node:child_process";
import { safeJsonParse, safeJsonStringify, } from "../../utils";

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
      child = spawn(cmd, args, { cwd: this.opts.cwd, stdio: ["pipe", "pipe", "pipe",], },);
    } catch (error) {
      this.closed = true;
      this.opts.onExit?.((error as Error).message,);
      return;
    }

    this.child = child;
    child.stdout.setEncoding("utf8",);
    child.stdout.on("data", (chunk: string,) => {
      this.buffer += chunk;
      let newline = this.buffer.indexOf("\n",);
      while (newline >= 0) {
        const line = this.buffer.slice(0, newline,).trimEnd();
        this.buffer = this.buffer.slice(newline + 1,);
        if (line.length > 0) { this.handleLine(line,); }
        newline = this.buffer.indexOf("\n",);
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
        this.opts.onNotification?.(msg.method, msg.params,);
      }

      return;
    }

    const p = this.pending.get(msg.id,);
    if (!p) { return; }
    this.pending.delete(msg.id,);
    clearTimeout(p.timer,);
    if (msg.error) {
      p.reject(new JsonRpcRequestError(msg.error.message ?? "json-rpc error", msg.error.code, msg.error.data,),);
    } else {
      p.resolve(msg.result,);
    }
  }
}
