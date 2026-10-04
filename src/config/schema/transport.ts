// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/transport.ts — Transport protocol / compression / limits config types

import type { CompressionAlgorithm, } from "../../db/enums";
import type { TransportSection, } from "../sections/transport";

/** */
export interface TransportCompressionConfig {
  /** Master toggle for transport compression */
  enabled: boolean;
  /** Default compression algorithm */
  default: CompressionAlgorithm;
  /** Minimum payload size (bytes) before compression kicks in */
  threshold: number;
}

/** */
export interface TransportLimitsConfig {
  /** Max frame size in bytes. Default 0x10000 (64 KiB) */
  maxFrameSize: number;
  /** Max payload size in bytes. Default 0x50000 (320 KiB) */
  maxPayload: number;
  /** Max concurrent streams (H2). Default 100 */
  maxConcurrentStreams: number;
}

export type TransportConfig = InstanceType<typeof TransportSection>;
