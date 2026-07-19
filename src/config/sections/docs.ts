// src/config/sections/docs.ts — Documentation config section

import type { DocumentationConfig } from "../schema";

export const DOCS_DEFAULTS = {
  enabled: true,
} satisfies DocumentationConfig;

export class DocsSection implements DocumentationConfig {
  enabled = DOCS_DEFAULTS.enabled;
  public?: string[];

  constructor(overrides?: Partial<DocumentationConfig>) {
    Object.assign(this, overrides);
  }
}

export const docsMeta = {
  type: "object" as const,
  properties: {
    enabled: {
      type: "boolean",
      default: DOCS_DEFAULTS.enabled,
      description: "Enable documentation serving",
    },
    public: {
      type: "array",
      items: { type: "string" },
      description: "Allowlist of doc path prefixes",
    },
  },
  required: ["enabled"] as const,
};
