// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/transport.ts — transport section defaults
import type {
  TransportCompressionConfig,
  TransportConfig,
  TransportLimitsConfig,
} from "../schema";

export const TRANSPORT_DEFAULTS = {
  defaultProtocol: "http/1.1" as const,
  enableWebSocket: true,
  enableWebTransport: false,
  enableH2: false,
  enableH3: false,
  compression: {
    enabled: false,
    default: "none" as const,
    threshold: 256,
  } satisfies TransportCompressionConfig,
  limits: {
    maxFrameSize: 0x1_00_00,
    maxPayload: 0x5_00_00,
    maxConcurrentStreams: 100,
  } satisfies TransportLimitsConfig,
} satisfies TransportConfig;
