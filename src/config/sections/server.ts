// src/config/sections/server.ts — Server config section
//
// Interface + defaults + schema metadata for server configuration.
// Single source of truth for this section's shape and defaults.

import type { ServerConfig, TlsConfig } from "../schema";
import { DATA_DIR } from "../constants";

export const SERVER_DEFAULTS = {
  port: 3000,
  host: "localhost",
  tls: {
    key: `${DATA_DIR}/certs/key.pem`,
    cert: `${DATA_DIR}/certs/cert.pem`,
  },
} satisfies ServerConfig;

export class ServerSection implements ServerConfig {
  port = SERVER_DEFAULTS.port;
  host = SERVER_DEFAULTS.host;
  tls: TlsConfig = { ...SERVER_DEFAULTS.tls };

  constructor(overrides?: Partial<ServerConfig>) {
    if (!overrides) return;

    const { tls, ...rest } = overrides;
    Object.assign(this, rest);
    if (tls) {
      this.tls = { ...this.tls, ...tls };
    }
  }
}

/** Schema metadata for JSON Schema auto-generation */
export const serverMeta = {
  type: "object" as const,
  description: "HTTP server configuration",
  properties: {
    port: {
      type: "integer",
      minimum: 0,
      maximum: 65_535,
      default: SERVER_DEFAULTS.port,
      description: "Server port (0 = random)",
    },
    host: { type: "string", default: SERVER_DEFAULTS.host, description: "Server host" },
    tls: {
      type: "object",
      description: "TLS certificate configuration",
      properties: {
        key: {
          type: "string",
          default: SERVER_DEFAULTS.tls.key,
          description: "Path to TLS private key (PEM)",
        },
        cert: {
          type: "string",
          default: SERVER_DEFAULTS.tls.cert,
          description: "Path to TLS certificate (PEM)",
        },
      },
      required: ["key", "cert"],
    },
  },
  required: ["port", "host"] as const,
};
