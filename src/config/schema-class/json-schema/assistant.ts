// src/config/schema-class/json-schema/assistant.ts — assistant JSON Schema section
export const assistant = {
  type: "object",
  description: "Assistant configuration",
  properties: {
    enabled: { type: "boolean", default: true, description: "Enable rule-based assistant", },
  },
  required: ["enabled",],
};
