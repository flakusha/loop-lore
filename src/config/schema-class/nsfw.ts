// src/config/schema-class/nsfw.ts — nsfw section defaults
import type { NsfwConfig, } from "../schema";

export const NSFW_DEFAULTS = {
  allowNsfw: true,
  nsfwMinAge: 18,
  defaultNsfwScope: "chat",
  consentRequired: true,
  auditLogging: true,
  useLlmClassifier: false,
} satisfies NsfwConfig;
