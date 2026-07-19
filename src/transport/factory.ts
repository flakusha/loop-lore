// src/transport/factory.ts — Protocol handler factory

import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";
import { withCompression, } from "./compression";
import { TransportError, TransportErrorCode, } from "./errors";
import { createH2Handler, } from "./h2";
import { createHttp1Handler, } from "./http1";
import type { ProtocolHandler, } from "./protocol.unified";
import { createWsHandler, } from "./ws";

/**
 * Configuration for creating a protocol handler.
 */
export interface TransportConfig {
  /** Protocol to use. */
  protocol: TransportProtocol;
  /** TLS configuration. */
  tls?: { key: string; cert: string };
  /** Compression algorithm. Default "none". */
  compression?: CompressionAlgorithm;
  /** Max frame size in bytes. */
  maxFrameSize?: number;
  /** Max payload size in bytes. */
  maxPayload?: number;
  /** Extension identifiers. */
  extensions?: string[];
  /** Server port. */
  port?: number;
  /** Server host. */
  host?: string;
}

/**
 * Create a ProtocolHandler for the specified transport protocol.
 *
 * Selection priority:
 * 1. Explicit `config.protocol`
 * 2. `Accept` header negotiation (handled by negotiate() before calling this)
 * 3. ALPN (TLS)
 * 4. Fallback: `http/1.1`
 *
 * @param config - Transport configuration
 * @returns ProtocolHandler with optional compression wrapper
 * @throws TransportError if protocol is unsupported
 *
 * @example
 * ```ts
 * // HTTP/1.1 with zstd compression
 * const handler = createProtocol({
 *   protocol: "http/1.1",
 *   compression: "zstd",
 *   port: 3000,
 * });
 *
 * // WebSocket client
 * const ws = createProtocol({
 *   protocol: "websocket",
 *   compression: "br",
 * });
 * ```
 */
export function createProtocol(config: TransportConfig,): ProtocolHandler {
  let handler: ProtocolHandler;

  switch (config.protocol) {
    case TransportProtocol.Http1_1: {
      handler = createHttp1Handler({
        port: config.port,
        host: config.host,
        tls: config.tls,
      },);
      break;
    }

    case TransportProtocol.Http2: {
      handler = createH2Handler({
        port: config.port,
        host: config.host,
        tls: config.tls,
      },);
      break;
    }

    case TransportProtocol.WebSocket: {
      handler = createWsHandler({
        port: config.port,
        host: config.host,
      },);
      break;
    }

    case TransportProtocol.Http3:
    case TransportProtocol.WebTransport:
    case TransportProtocol.Tcp:
    case TransportProtocol.Tls: {
      throw new TransportError(`protocol "${config.protocol}" not yet implemented`, {
        code: TransportErrorCode.ProtocolUnsupported,
        recoverable: true,
      },);
    }

    default: {
      throw new TransportError(`unknown protocol: ${String(config.protocol,)}`, {
        code: TransportErrorCode.ProtocolUnsupported,
      },);
    }
  }

  // Apply compression wrapper if configured
  const algo = config.compression ?? CompressionAlgorithm.None;
  if (algo !== CompressionAlgorithm.None) {
    handler = withCompression({ handler, algorithm: algo, },);
  }

  return handler;
}

export { withCompression, } from "./compression";
export { createH2Handler, } from "./h2";
export { createHttp1Handler, } from "./http1";
export { createWsHandler, } from "./ws";
