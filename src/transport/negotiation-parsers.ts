// src/transport/negotiation-parsers.ts — Header parsing helpers for negotiation

import { TransportProtocol, CompressionAlgorithm } from "../db/enums";

/**
 * Parse `Accept` header into ordered protocol preference list.
 */
export function parseAcceptProtocols(accept: string | null): TransportProtocol[] {
  if (!accept) return [];
  const map: Record<string, TransportProtocol> = {
    "http/1.1": TransportProtocol.Http1_1,
    "http/2": TransportProtocol.Http2,
    "http/3": TransportProtocol.Http3,
    websocket: TransportProtocol.WebSocket,
    webtransport: TransportProtocol.WebTransport,
  };

  return accept
    .split(",", 100)
    .map((part) => {
      const [proto, qStr] = part.trim().split(";", 2);
      const q = qStr ? Number(qStr.split("=", 2)[1] ?? 1) : 1;
      const key = proto!.trim();
      if (!Object.hasOwn(map, key)) {
        return null;
      }
      return { protocol: map[key], q };
    })
    .filter((entry): entry is { protocol: TransportProtocol; q: number } => entry != null)
    .toSorted((a, b) => b.q - a.q)
    .map((entry) => entry.protocol);
}

/**
 * Parse `Accept-Encoding` header into ordered compression preference list.
 */
export function parseAcceptEncoding(acceptEncoding: string | null): CompressionAlgorithm[] {
  if (!acceptEncoding) return [];
  const map: Record<string, CompressionAlgorithm> = {
    zstd: CompressionAlgorithm.Zstd,
    br: CompressionAlgorithm.Brotli,
    gzip: CompressionAlgorithm.Gzip,
    identity: CompressionAlgorithm.None,
  };

  return acceptEncoding
    .split(",", 100)
    .map((part) => {
      const [algo, qStr] = part.trim().split(";", 2);
      const q = qStr ? Number(qStr.split("=", 2)[1] ?? 1) : 1;
      const key = algo!.trim();
      if (!Object.hasOwn(map, key)) {
        return null;
      }
      return { algorithm: map[key], q };
    })
    .filter((entry): entry is { algorithm: CompressionAlgorithm; q: number } => entry != null)
    .toSorted((a, b) => b.q - a.q)
    .map((entry) => entry.algorithm);
}

/**
 * Parse `Sec-WebSocket-Extensions` or custom extension header.
 */
export function parseExtensions(header: string | null): string[] {
  if (!header) return [];
  return header.split(",").map((ext) => ext.trim().split(";", 1)[0]!.trim());
}
