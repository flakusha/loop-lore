// src/config/schema-class/json-schema/tui.ts — tui JSON Schema section
export const tui = {
  type: "object",
  properties: {
    enabled: { type: "boolean", default: true, description: "Enable TUI mode", },
  },
  required: ["enabled",],
};
