// src/config/schema-class/dynamic-response.ts — dynamic-response section defaults
import type { DynamicResponseConfig, } from "../schema";

export const DYNAMIC_RESPONSE_DEFAULTS = {
  enabled: true,
  minify: true,
  validate: true,
  compress: true,
  compressAlgorithm: "auto",
  compressThreshold: 512,
} satisfies DynamicResponseConfig;
