// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/byo-key.ts — BYO API Key config section

export const BYO_KEY_DEFAULTS = {
  enabled: true,
};

/** */
export class ByoKeySection {
  enabled = BYO_KEY_DEFAULTS.enabled;
  encryptionKey?: string;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<ByoKeySection>,) {
    Object.assign(this, overrides,);
  }
}

export type ByoKeyConfig = ByoKeySection;

export const byoKeyMeta = {
  type: "object" as const,
  description: "BYO API Key configuration",
  properties: {
    enabled: {
      type: "boolean",
      default: BYO_KEY_DEFAULTS.enabled,
      description: "Enable user-owned API keys",
    },
    encryptionKey: {
      type: "string",
      description: "Encryption key for stored API keys",
    },
  },
  required: ["enabled",] as const,
};
