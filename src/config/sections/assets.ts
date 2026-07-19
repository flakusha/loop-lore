// src/config/sections/assets.ts — Assets config section

import { DATA_DIR, } from "../constants";
import type { AssetsConfig, } from "../schema";

export const ASSETS_DEFAULTS = {
  enabled: true,
  uploadDir: `${DATA_DIR}/uploads`,
  maxFileSize: 10_485_760,
  compression: true,
} satisfies AssetsConfig;

export class AssetsSection implements AssetsConfig {
  enabled = ASSETS_DEFAULTS.enabled;
  uploadDir = ASSETS_DEFAULTS.uploadDir;
  maxFileSize = ASSETS_DEFAULTS.maxFileSize;
  compression = ASSETS_DEFAULTS.compression;

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
  },
  required: ["enabled", "uploadDir", "maxFileSize", "compression",] as const,
};
