// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/docs.ts — Documentation config section

export const DOCS_DEFAULTS = {
  enabled: true,
};

/** */
export class DocsSection {
  enabled = DOCS_DEFAULTS.enabled;
  public?: string[];

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<DocsSection>,) {
    Object.assign(this, overrides,);
  }
}

export type DocumentationConfig = DocsSection;

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
      items: { type: "string", },
      description: "Allowlist of doc path prefixes",
    },
  },
  required: ["enabled",] as const,
};
