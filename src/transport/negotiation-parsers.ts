// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/transport/negotiation-parsers.ts — Header parsing helpers for negotiation

import { CompressionAlgorithm, TransportProtocol, } from "../db/enums";

/**
 * Parse `Accept` header into ordered protocol preference list.
 */
export function parseAcceptProtocols(accept: string | null,): TransportProtocol[] {
  if (!accept) { return []; }
  const map: Record<string, TransportProtocol> = {
    "http/1.1": TransportProtocol.Http1_1,
    "http/2": TransportProtocol.Http2,
    "http/3": TransportProtocol.Http3,
    websocket: TransportProtocol.WebSocket,
    webtransport: TransportProtocol.WebTransport,
  };

  const parsed: { protocol: TransportProtocol; q: number }[] = [];
  for (const part of accept.split(",", 100,)) {
    const [proto, qStr,] = part.trim().split(";", 2,);
    const qRaw = qStr ? Number(qStr.split("=", 2,)[1] ?? 1,) : 1;
    const q = Number.isFinite(qRaw,) ? Math.min(1, Math.max(0, qRaw,),) : 1;
    const key = proto!.trim();
    if (!Object.hasOwn(map, key,)) {
      continue;
    }
    // q<=0 means "not acceptable" (RFC 7231) — exclude from negotiation.
    if (q <= 0) { continue; }
    parsed.push({ protocol: map[key]!, q, },);
  }
  const sorted = parsed.toSorted((a, b,) => b.q - a.q);
  return Array.from(sorted, (entry,) => entry.protocol,);
}

/**
 * Parse `Accept-Encoding` header into ordered compression preference list.
 */
export function parseAcceptEncoding(acceptEncoding: string | null,): CompressionAlgorithm[] {
  if (!acceptEncoding) { return []; }
  const map: Record<string, CompressionAlgorithm> = {
    zstd: CompressionAlgorithm.Zstd,
    br: CompressionAlgorithm.Brotli,
    gzip: CompressionAlgorithm.Gzip,
    identity: CompressionAlgorithm.None,
  };

  const parsed: { algorithm: CompressionAlgorithm; q: number }[] = [];
  for (const part of acceptEncoding.split(",", 100,)) {
    const [algo, qStr,] = part.trim().split(";", 2,);
    const qRaw = qStr ? Number(qStr.split("=", 2,)[1] ?? 1,) : 1;
    const q = Number.isFinite(qRaw,) ? Math.min(1, Math.max(0, qRaw,),) : 1;
    const key = algo!.trim();
    if (!Object.hasOwn(map, key,)) {
      continue;
    }
    // q<=0 means "not acceptable" (RFC 7231) — exclude from negotiation.
    if (q <= 0) { continue; }
    parsed.push({ algorithm: map[key]!, q, },);
  }
  const sorted = parsed.toSorted((a, b,) => b.q - a.q);
  return Array.from(sorted, (entry,) => entry.algorithm,);
}

/**
 * Parse `Sec-WebSocket-Extensions` or custom extension header.
 */
export function parseExtensions(header: string | null,): string[] {
  if (!header) { return []; }
  return Array.from(header.split(",",), (ext,) => ext.trim().split(";", 1,)[0]!.trim(),);
}
