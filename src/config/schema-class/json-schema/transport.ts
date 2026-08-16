// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/transport.ts — transport JSON Schema section
export const transport = {
  type: "object",
  description: "Transport configuration",
  properties: {
    defaultProtocol: {
      type: "string",
      enum: ["http/1.1", "http/2", "http/3", "websocket", "webtransport", "tcp", "tls",],
      default: "http/1.1",
    },
    enableWebSocket: { type: "boolean", default: true, },
    enableWebTransport: { type: "boolean", default: false, },
    enableH2: { type: "boolean", default: false, },
    enableH3: { type: "boolean", default: false, },
    compression: {
      type: "object",
      properties: {
        enabled: { type: "boolean", default: false, },
        default: { type: "string", enum: ["zstd", "br", "gzip", "none",], default: "none", },
        threshold: { type: "integer", default: 256, },
      },
      required: ["enabled", "default", "threshold",],
    },
    limits: {
      type: "object",
      properties: {
        maxFrameSize: { type: "integer", default: 65_536, },
        maxPayload: { type: "integer", default: 327_680, },
        maxConcurrentStreams: { type: "integer", default: 100, },
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
  ],
};
