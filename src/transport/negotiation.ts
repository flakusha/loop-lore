// src/transport/negotiation.ts — Protocol + compression negotiation

import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";
import { parseAcceptEncoding, parseAcceptProtocols, parseExtensions, } from "./negotiation-parsers";

/**
 * Server-side capabilities advertised during negotiation.
 */
export interface ServerCapabilities {
  /** Protocols the server supports. */
  protocols: TransportProtocol[];
  /** Compression algorithms the server supports. */
  compression: CompressionAlgorithm[];
  /** Max frame size in bytes. Default 0x10000 (64 KiB). */
  maxFrameSize: number;
  /** Max payload size in bytes. Default 0x50000 (320 KiB). */
  maxPayload: number;
  /** Extension identifiers (e.g. "handshake/v1", "compression/zstd"). */
  extensions: string[];
}

/**
 * Result of protocol negotiation.
 */
export interface NegotiationResult {
  /** Negotiated transport protocol. */
  protocol: TransportProtocol;
  /** Negotiated compression algorithm. */
  compression: CompressionAlgorithm;
  /** Agreed extensions. */
  extensions: string[];
  /** Max frame size for this connection. */
  maxFrameSize: number;
  /** Max payload size for this connection. */
  maxPayload: number;
}

const DEFAULT_CAPABILITIES: ServerCapabilities = {
  protocols: [TransportProtocol.Http1_1,],
  compression: [CompressionAlgorithm.Zstd, CompressionAlgorithm.Brotli, CompressionAlgorithm.Gzip,],
  maxFrameSize: 0x1_00_00,
  maxPayload: 0x5_00_00,
  extensions: ["compression/zstd", "compression/br", "handshake/v1",],
};

/**
 * Negotiate protocol and compression from an incoming HTTP request.
 *
 * Selection priority:
 * 1. `Accept` header protocol preference
 * 2. ALPN (TLS) — not applicable in this layer, handled by server
 * 3. Fallback: `http/1.1`
 *
 * @param request - Incoming HTTP request
 * @param serverCaps - Server capabilities (defaults to standard caps)
 * @returns Agreed protocol, compression, extensions, limits
 */
export function negotiate(
  request: Request,
  serverCaps: ServerCapabilities = DEFAULT_CAPABILITIES,
): NegotiationResult {
  // ── Protocol ──────────────────────────────────────────
  const acceptProtocols = parseAcceptProtocols(request.headers.get("accept",),);
  let protocol = serverCaps.protocols[0] ?? TransportProtocol.Http1_1;

  for (const candidate of acceptProtocols) {
    if (serverCaps.protocols.includes(candidate,)) {
      protocol = candidate;
      break;
    }
  }

  // ── Compression ───────────────────────────────────────
  const acceptEncoding = parseAcceptEncoding(request.headers.get("accept-encoding",),);
  let compression: CompressionAlgorithm = CompressionAlgorithm.None;

  for (const candidate of acceptEncoding) {
    if (serverCaps.compression.includes(candidate,)) {
      compression = candidate;
      break;
    }
  }

  // ── Extensions ────────────────────────────────────────
  const clientExtensions = parseExtensions(request.headers.get("sec-websocket-extensions",),);
  const extensions = serverCaps.extensions.filter((ext,) => clientExtensions.includes(ext,));

  return {
    protocol,
    compression,
    extensions,
    maxFrameSize: serverCaps.maxFrameSize,
    maxPayload: serverCaps.maxPayload,
  };
}

export { DEFAULT_CAPABILITIES, };

export { parseAcceptEncoding, parseAcceptProtocols, parseExtensions, } from "./negotiation-parsers";
