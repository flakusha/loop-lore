// src/config/schema-class/json-schema/hooks.ts — hooks JSON Schema section
export const hooks = {
  type: "object",
  description: "Content hooks configuration (mood, emotion, NSFW, moderation)",
  properties: {
    enableMoodHooks: { type: "boolean", default: true, description: "Enable mood shift detection", },
    enableEmotionHooks: { type: "boolean", default: true, description: "Enable emotion change detection", },
    enableNsfwHooks: { type: "boolean", default: true, description: "Enable NSFW content gating", },
    enableModerationHooks: { type: "boolean", default: true, description: "Enable moderation flagging", },
  },
  required: ["enableMoodHooks", "enableEmotionHooks", "enableNsfwHooks", "enableModerationHooks",],
};
