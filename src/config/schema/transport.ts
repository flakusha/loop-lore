// src/config/schema/transport.ts — Transport protocol / compression / limits config types

import type {
  CompressionAlgorithm,
  TransportProtocol,
} from "../../db/enums";

export interface TransportCompressionConfig {
  /** Master toggle for transport compression */
  enabled: boolean;
  /** Default compression algorithm */
  default: CompressionAlgorithm;
  /** Minimum payload size (bytes) before compression kicks in */
  threshold: number;
}

export interface TransportLimitsConfig {
  /** Max frame size in bytes. Default 0x10000 (64 KiB) */
  maxFrameSize: number;
  /** Max payload size in bytes. Default 0x50000 (320 KiB) */
  maxPayload: number;
  /** Max concurrent streams (H2). Default 100 */
  maxConcurrentStreams: number;
}

export interface TransportConfig {
  /** Default transport protocol */
  defaultProtocol: TransportProtocol;
  /** Enable WebSocket upgrade support */
  enableWebSocket: boolean;
  /** Enable WebTransport support (requires H3) */
  enableWebTransport: boolean;
  /** Enable HTTP/2 support */
  enableH2: boolean;
  /** Enable HTTP/3 support (requires QUIC/Bun support) */
  enableH3: boolean;
  /** Compression settings */
  compression: TransportCompressionConfig;
  /** Connection limits */
  limits: TransportLimitsConfig;
}
