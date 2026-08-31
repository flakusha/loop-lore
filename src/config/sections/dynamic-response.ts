// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/dynamic-response.ts — Dynamic response config section

import type { DynamicResponseConfig, } from "../schema";

export const DYNAMIC_RESPONSE_DEFAULTS = {
  enabled: true,
  minify: true,
  validate: true,
  compress: true,
  compressAlgorithm: "auto" as const,
  compressThreshold: 512,
} satisfies DynamicResponseConfig;

/** */
export class DynamicResponseSection implements DynamicResponseConfig {
  enabled = DYNAMIC_RESPONSE_DEFAULTS.enabled;
  minify = DYNAMIC_RESPONSE_DEFAULTS.minify;
  validate = DYNAMIC_RESPONSE_DEFAULTS.validate;
  compress = DYNAMIC_RESPONSE_DEFAULTS.compress;
  compressAlgorithm = DYNAMIC_RESPONSE_DEFAULTS.compressAlgorithm;
  compressThreshold = DYNAMIC_RESPONSE_DEFAULTS.compressThreshold;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<DynamicResponseConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const dynamicResponseMeta = {
  type: "object" as const,
  description: "Dynamic-response optimization (minify / validate / compress runtime HTML/CSS/JS/JSON)",
  properties: {
    enabled: { type: "boolean", default: DYNAMIC_RESPONSE_DEFAULTS.enabled, description: "Master toggle", },
    minify: {
      type: "boolean",
      default: DYNAMIC_RESPONSE_DEFAULTS.minify,
      description: "Strip whitespace + comments from text bodies",
    },
    validate: {
      type: "boolean",
      default: DYNAMIC_RESPONSE_DEFAULTS.validate,
      description: "Validate html/css/js parse; skip minify + log on failure",
    },
    compress: {
      type: "boolean",
      default: DYNAMIC_RESPONSE_DEFAULTS.compress,
      description: "Apply Content-Encoding based on Accept-Encoding",
    },
    compressAlgorithm: {
      type: "string",
      enum: ["br", "gzip", "auto",],
      default: DYNAMIC_RESPONSE_DEFAULTS.compressAlgorithm,
      description: "Preferred algorithm; auto prefers br when advertised",
    },
    compressThreshold: {
      type: "number",
      default: DYNAMIC_RESPONSE_DEFAULTS.compressThreshold,
      description: "Minimum body size (bytes) before compression",
    },
  },
  required: ["enabled", "minify", "validate", "compress", "compressAlgorithm", "compressThreshold",] as const,
};
