// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/assets.ts — assets JSON Schema section
import { DATA_DIR, } from "../../constants";

export const assets = {
  type: "object",
  description: "Asset storage configuration",
  properties: {
    enabled: { type: "boolean", default: true, description: "Enable asset uploads", },
    uploadDir: {
      type: "string",
      default: `${DATA_DIR}/uploads`,
      description: "Directory for uploaded assets",
    },
    maxFileSize: {
      type: "integer",
      minimum: 0,
      default: 10_485_760,
      description: "Max upload size in bytes (default 10 MB)",
    },
    compression: { type: "boolean", default: true, description: "Compress uploaded assets", },
    signedUrlSecret: {
      type: "string",
      default: "",
      description:
        "HMAC-SHA256 secret for signed asset URLs. Env-only: ASSETS_SIGNED_URL_SECRET. Falls back to auth.jwtSecret.",
    },
    signedUrlExpirySeconds: {
      type: "integer",
      minimum: 1,
      default: 900,
      description: "Signed-URL lifetime in seconds (default: 900 = 15 min)",
    },
  },
  required: ["enabled", "uploadDir", "maxFileSize", "compression",],
};
