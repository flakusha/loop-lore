// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/server.ts — server JSON Schema section
// Default paths are emitted as `${DATA_DIR}/...` placeholders, not the
// resolved absolute path, so the published JSON Schema is portable across
// dev checkouts / worktrees / CI machines. Consumers resolve `DATA_DIR` at
// runtime via `path.resolve(<repo>/loop-lore-data)` (see src/config/constants.ts).

export const server = {
  type: "object",
  description: "HTTP server configuration",
  properties: {
    port: {
      type: "integer",
      minimum: 0,
      maximum: 65_535,
      default: 3000,
      description: "Server port (0 = random)",
    },
    host: { type: "string", default: "localhost", description: "Server host", },
    trustProxy: {
      type: "boolean",
      default: false,
      description: "Honor X-Forwarded-For / X-Real-IP / CF-Connecting-IP. Default false. Env: SERVER_TRUST_PROXY=1.",
    },
    tls: {
      type: "object",
      description: "TLS certificate configuration",
      properties: {
        key: {
          type: "string",
          default: "${DATA_DIR}/certs/key.pem",
          description: "Path to TLS private key (PEM). DATA_DIR resolves to <repo>/loop-lore-data at runtime.",
        },
        cert: {
          type: "string",
          default: "${DATA_DIR}/certs/cert.pem",
          description: "Path to TLS certificate (PEM). DATA_DIR resolves to <repo>/loop-lore-data at runtime.",
        },
      },
      required: ["key", "cert",],
    },
  },
  required: ["port", "host",],
};
