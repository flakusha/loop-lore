// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/dynamic-response.ts — dynamic-response JSON Schema section
export const dynamicResponse = {
  type: "object",
  description: "Dynamic-response optimization (minify / validate / compress runtime HTML/CSS/JS/JSON)",
  properties: {
    enabled: { type: "boolean", default: true, description: "Master toggle", },
    minify: {
      type: "boolean",
      default: true,
      description: "Strip whitespace + comments from text bodies",
    },
    validate: {
      type: "boolean",
      default: true,
      description: "Validate html/css/js parse; skip minify + log on failure",
    },
    compress: {
      type: "boolean",
      default: true,
      description: "Apply Content-Encoding based on Accept-Encoding",
    },
    compressAlgorithm: {
      type: "string",
      enum: ["br", "gzip", "auto",],
      default: "auto",
      description: "Preferred algorithm; auto prefers br when advertised",
    },
    compressThreshold: {
      type: "number",
      default: 512,
      description: "Minimum body size (bytes) before compression",
    },
  },
  required: ["enabled", "minify", "validate", "compress", "compressAlgorithm", "compressThreshold",],
};
