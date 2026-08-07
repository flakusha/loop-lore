// src/config/schema-class/json-schema/nsfw.ts — nsfw JSON Schema section
export const nsfw = {
  type: "object",
  description: "NSFW configuration",
  properties: {
    allowNsfw: { type: "boolean", default: true, description: "Allow NSFW content", },
    nsfwMinAge: { type: "integer", default: 18, description: "Minimum age for NSFW content", },
    defaultNsfwScope: { type: "string", enum: ["chat", "user", "world",], default: "chat", },
    consentRequired: { type: "boolean", default: true, },
    auditLogging: { type: "boolean", default: true, },
    useLlmClassifier: {
      type: "boolean",
      default: false,
      description: "Augment NSFW keyword detection with an LLM content rating classifier",
    },
  },
  required: ["allowNsfw", "nsfwMinAge",],
};
