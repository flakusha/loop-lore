// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/transport.ts — Transport config section

import type { TransportCompressionConfig, TransportConfig, TransportLimitsConfig, } from "../schema";

export const TRANSPORT_COMPRESSION_DEFAULTS = {
  enabled: false,
  default: "none" as const,
  threshold: 256,
} satisfies TransportCompressionConfig;

export const TRANSPORT_LIMITS_DEFAULTS = {
  maxFrameSize: 0x1_00_00,
  maxPayload: 0x5_00_00,
  maxConcurrentStreams: 100,
} satisfies TransportLimitsConfig;

export const TRANSPORT_DEFAULTS = {
  defaultProtocol: "http/1.1" as const,
  enableWebSocket: true,
  enableWebTransport: false,
  enableH2: false,
  enableH3: false,
  compression: TRANSPORT_COMPRESSION_DEFAULTS,
  limits: TRANSPORT_LIMITS_DEFAULTS,
} satisfies TransportConfig;

/** */
export class TransportSection implements TransportConfig {
  defaultProtocol = TRANSPORT_DEFAULTS.defaultProtocol;
  enableWebSocket = TRANSPORT_DEFAULTS.enableWebSocket;
  enableWebTransport = TRANSPORT_DEFAULTS.enableWebTransport;
  enableH2 = TRANSPORT_DEFAULTS.enableH2;
  enableH3 = TRANSPORT_DEFAULTS.enableH3;
  compression: TransportCompressionConfig = { ...TRANSPORT_DEFAULTS.compression, };
  limits: TransportLimitsConfig = { ...TRANSPORT_DEFAULTS.limits, };

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<TransportConfig>,) {
    if (!overrides) { return; }

    const { compression, limits, ...rest } = overrides;
    Object.assign(this, rest,);
    if (compression) {
      this.compression = { ...this.compression, ...compression, };
    }
    if (limits) {
      this.limits = { ...this.limits, ...limits, };
    }
  }
}

export const transportMeta = {
  type: "object" as const,
  description: "Transport configuration",
  properties: {
    defaultProtocol: {
      type: "string",
      enum: ["http/1.1", "http/2", "http/3", "websocket", "webtransport", "tcp", "tls",],
      default: TRANSPORT_DEFAULTS.defaultProtocol,
    },
    enableWebSocket: { type: "boolean", default: TRANSPORT_DEFAULTS.enableWebSocket, },
    enableWebTransport: { type: "boolean", default: TRANSPORT_DEFAULTS.enableWebTransport, },
    enableH2: { type: "boolean", default: TRANSPORT_DEFAULTS.enableH2, },
    enableH3: { type: "boolean", default: TRANSPORT_DEFAULTS.enableH3, },
    compression: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: TRANSPORT_COMPRESSION_DEFAULTS.enabled, },
        default: {
          type: "string",
          enum: ["zstd", "br", "gzip", "none",],
          default: TRANSPORT_COMPRESSION_DEFAULTS.default,
        },
        threshold: { type: "integer", default: TRANSPORT_COMPRESSION_DEFAULTS.threshold, },
      },
      required: ["enabled", "default", "threshold",],
    },
    limits: {
      type: "object",
      properties: {
        maxFrameSize: { type: "integer", default: TRANSPORT_LIMITS_DEFAULTS.maxFrameSize, },
        maxPayload: { type: "integer", default: TRANSPORT_LIMITS_DEFAULTS.maxPayload, },
        maxConcurrentStreams: { type: "integer", default: TRANSPORT_LIMITS_DEFAULTS.maxConcurrentStreams, },
      },
      required: ["maxFrameSize", "maxPayload", "maxConcurrentStreams",],
    },
  },
  required: [
    "defaultProtocol",
    "enableWebSocket",
    "enableWebTransport",
    "enableH2",
    "enableH3",
    "compression",
    "limits",
  ] as const,
};
