// src/config/schema-class/server.ts — server section defaults
import { DATA_DIR, } from "../constants";
import type { ServerConfig, } from "../schema";

export const SERVER_DEFAULTS = {
  port: 3000,
  host: "localhost",
  tls: {
    key: `${DATA_DIR}/certs/key.pem`,
    cert: `${DATA_DIR}/certs/cert.pem`,
  },
} satisfies ServerConfig;
