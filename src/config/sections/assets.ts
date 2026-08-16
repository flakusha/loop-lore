// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/assets.ts — Assets config section

import { DATA_DIR, } from "../constants";
import type { AssetsConfig, } from "../schema";

export const ASSETS_DEFAULTS = {
  enabled: true,
  uploadDir: `${DATA_DIR}/uploads`,
  maxFileSize: 10_485_760,
  compression: true,
  signedUrlSecret: "",
  signedUrlExpirySeconds: 900,
} satisfies AssetsConfig;

export class AssetsSection implements AssetsConfig {
  enabled = ASSETS_DEFAULTS.enabled;
  uploadDir = ASSETS_DEFAULTS.uploadDir;
  maxFileSize = ASSETS_DEFAULTS.maxFileSize;
  compression = ASSETS_DEFAULTS.compression;
  signedUrlSecret = ASSETS_DEFAULTS.signedUrlSecret;
  signedUrlExpirySeconds = ASSETS_DEFAULTS.signedUrlExpirySeconds;

  constructor(overrides?: Partial<AssetsConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const assetsMeta = {
  type: "object" as const,
  description: "Asset storage configuration",
  properties: {
    enabled: { type: "boolean", default: ASSETS_DEFAULTS.enabled, description: "Enable asset uploads", },
    uploadDir: {
      type: "string",
      default: ASSETS_DEFAULTS.uploadDir,
      description: "Directory for uploaded assets",
    },
    maxFileSize: {
      type: "integer",
      minimum: 0,
      default: ASSETS_DEFAULTS.maxFileSize,
      description: "Max upload size in bytes (default 10 MB)",
    },
    compression: {
      type: "boolean",
      default: ASSETS_DEFAULTS.compression,
      description: "Compress uploaded assets",
    },
    signedUrlSecret: {
      type: "string",
      default: ASSETS_DEFAULTS.signedUrlSecret,
      description:
        "HMAC-SHA256 secret for signed asset URLs. Env-only: ASSETS_SIGNED_URL_SECRET. Falls back to auth.jwtSecret.",
    },
    signedUrlExpirySeconds: {
      type: "integer",
      minimum: 1,
      default: ASSETS_DEFAULTS.signedUrlExpirySeconds,
      description: "Signed-URL lifetime in seconds (default: 900 = 15 min)",
    },
  },
  required: ["enabled", "uploadDir", "maxFileSize", "compression",] as const,
};
