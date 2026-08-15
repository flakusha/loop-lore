// src/config/schema-class/json-schema/age-gate.ts — age-gate JSON Schema section
export const ageGate = {
  type: "object",
  description: "Age verification configuration",
  properties: {
    enabled: { type: "boolean", default: false, description: "Enable age gating", },
    minimumAge: { type: "integer", default: 18, description: "Minimum required age", },
    mode: {
      type: "string",
      enum: ["none", "self-declaration", "verification",],
      default: "self-declaration",
      description: "Age gate mode",
    },
  },
  required: ["enabled", "minimumAge", "mode",],
};
