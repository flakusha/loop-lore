// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/server.ts — HTTP server + TLS config types

export interface TlsConfig {
  /** Path to TLS private key (PEM). Auto-generated if missing. */
  key: string;
  /** Path to TLS certificate (PEM). Auto-generated if missing. */
  cert: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  /** TLS config. If key/cert paths are set, serve HTTPS too. */
  tls?: TlsConfig;
}
