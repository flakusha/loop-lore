// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/server.ts — HTTP server + TLS config types

import type { ServerSection, } from "../sections/server";

/** */
export interface TlsConfig {
  /** Path to TLS private key (PEM). Auto-generated if missing. */
  key: string;
  /** Path to TLS certificate (PEM). Auto-generated if missing. */
  cert: string;
}

export type ServerConfig = InstanceType<typeof ServerSection>;
