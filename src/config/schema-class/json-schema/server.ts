// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/server.ts — server JSON Schema section
import { DATA_DIR, } from "../../constants";

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
    tls: {
      type: "object",
      description: "TLS certificate configuration",
      properties: {
        key: {
          type: "string",
          default: `${DATA_DIR}/certs/key.pem`,
          description: "Path to TLS private key (PEM)",
        },
        cert: {
          type: "string",
          default: `${DATA_DIR}/certs/cert.pem`,
          description: "Path to TLS certificate (PEM)",
        },
      },
      required: ["key", "cert",],
    },
  },
  required: ["port", "host",],
};
