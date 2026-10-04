// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/age-gate.ts — Age gate config section

import { AgeGateMode, } from "../../db/enums";

export const AGE_GATE_DEFAULTS = {
  enabled: false,
  minimumAge: 18,
  mode: AgeGateMode.SelfDeclaration,
};

/** */
export class AgeGateSection {
  enabled = AGE_GATE_DEFAULTS.enabled;
  minimumAge = AGE_GATE_DEFAULTS.minimumAge;
  mode: AgeGateMode = AGE_GATE_DEFAULTS.mode;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<AgeGateSection>,) {
    Object.assign(this, overrides,);
  }
}

export type AgeGateConfig = AgeGateSection;

export const ageGateMeta = {
  type: "object" as const,
  description: "Age verification configuration",
  properties: {
    enabled: { type: "boolean", default: AGE_GATE_DEFAULTS.enabled, description: "Enable age gating", },
    minimumAge: {
      type: "integer",
      default: AGE_GATE_DEFAULTS.minimumAge,
      description: "Minimum required age",
    },
    mode: {
      type: "string",
      enum: ["none", "self-declaration", "verification",],
      default: AGE_GATE_DEFAULTS.mode,
      description: "Age gate mode",
    },
  },
  required: ["enabled", "minimumAge", "mode",] as const,
};
