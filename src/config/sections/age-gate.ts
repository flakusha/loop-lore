// src/config/sections/age-gate.ts — Age gate config section

import { AgeGateMode } from "../../db/enums";
import type { AgeGateConfig } from "../schema";

export const AGE_GATE_DEFAULTS = {
  enabled: false,
  minimumAge: 18,
  mode: AgeGateMode.SelfDeclaration,
} satisfies AgeGateConfig;

export class AgeGateSection implements AgeGateConfig {
  enabled = AGE_GATE_DEFAULTS.enabled;
  minimumAge = AGE_GATE_DEFAULTS.minimumAge;
  mode = AGE_GATE_DEFAULTS.mode;

  constructor(overrides?: Partial<AgeGateConfig>) {
    Object.assign(this, overrides);
  }
}

export const ageGateMeta = {
  type: "object" as const,
  description: "Age verification configuration",
  properties: {
    enabled: { type: "boolean", default: AGE_GATE_DEFAULTS.enabled, description: "Enable age gating" },
    minimumAge: {
      type: "integer",
      default: AGE_GATE_DEFAULTS.minimumAge,
      description: "Minimum required age",
    },
    mode: {
      type: "string",
      enum: ["none", "self-declaration", "verification"],
      default: AGE_GATE_DEFAULTS.mode,
      description: "Age gate mode",
    },
  },
  required: ["enabled", "minimumAge", "mode"] as const,
};
