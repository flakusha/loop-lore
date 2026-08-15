// src/config/schema-class/json-schema/byo-key.ts — BYO key JSON Schema section
export const byoKey = {
  type: "object",
  description: "BYO API Key configuration",
  properties: {
    enabled: { type: "boolean", default: true, description: "Enable user-owned API keys", },
    encryptionKey: { type: "string", description: "Encryption key for stored API keys", },
  },
  required: ["enabled",],
};
