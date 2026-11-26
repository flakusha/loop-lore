// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * stdio-proxy-relay.ts — Design B stdio shim, relay runtime.
 *
 * Both ends of the post-handshake relay: the shim side
 * (`runStdioProxyRelay`, used by the `--proxy` mains) and the shared
 * line reader (`readSocketLine`, also used by the listener's handshake).
 * Framing is line-delimited JSON, exactly like StdioServerTransport, so
 * behavior never drifts between local and proxied stdio.
 */

import { connect, type Socket, } from "node:net";
import {
  decodeProxyAck,
  encodeProxyHandshake,
  parseProxyTarget,
  STDIO_PROXY_LINE_MAX_BYTES,
  STDIO_PROXY_LINE_TIMEOUT_MS,
  type StdioProxyProtocol,
} from "./stdio-proxy";
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
