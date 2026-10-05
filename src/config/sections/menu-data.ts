// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Config menu data — constants and helpers extracted from menu.ts.
 *
 * system_config keys that map to config section fields (camelCase → snake).
 */
import type { ConfigMenuField, } from "./menu";

export const EDITABLE_KEY_MAP: Record<string, Record<string, string>> = {
  auth: {
    registrationOpen: "registration_open",
    sessionTimeoutHours: "session_timeout_hours",
    maxSessionsPerUser: "max_sessions_per_user",
  },
  assets: {
    maxFileSize: "max_upload_size_bytes",
  },
  generation: {
    defaultProvider: "default_provider",
    defaultModels: "default_model",
  },
};

/** Standalone system_config keys not in any section meta. */
export const STANDALONE_KEYS: {
  key: string;
  label: string;
  type: ConfigMenuField["type"];
  description: string;
  section: string;
}[] = [
  {
    key: "log_retention_days",
    label: "Log Retention (days)",
    type: "number",
    description: "Audit log retention in days",
    section: "logging",
  },
  {
    key: "archive_retention_days",
    label: "Archive Retention (days)",
    type: "number",
    description: "Chat archive purge retention in days",
    section: "messages",
  },
  {
    key: "memory_keyphrase_recall",
    label: "Memory Keyphrase Recall",
    type: "boolean",
    description: "Inject journal memories on keyphrase match",
    section: "generation",
  },
  {
    key: "memory_keyphrase_recall_limit",
    label: "Memory Recall Limit",
    type: "number",
    description: "Max keyphrase-triggered memory recalls per message",
    section: "generation",
  },
  {
    key: "auto_moderation",
    label: "Auto-Moderation",
    type: "boolean",
    description: "Enable auto-moderation rules",
    section: "moderation",
  },
  {
    key: "profanity_filter",
    label: "Profanity Filter",
    type: "boolean",
    description: "Enable profanity filter",
    section: "moderation",
  },
  {
    key: "spam_detection",
    label: "Spam Detection",
    type: "boolean",
    description: "Enable spam detection",
    section: "moderation",
  },
  {
    key: "max_flags_before_hide",
    label: "Max Flags Before Hide",
    type: "number",
    description: "Auto-hide content after N flags",
    section: "moderation",
  },
  {
    key: "wardrobe_loadout_bridge",
    label: "Wardrobe Loadout Bridge",
    type: "boolean",
    description: "Auto-switch outfit from equipped items",
    section: "characters",
  },
];

/**
 * Domain grouping for the section navigator. Sections absent from the map land
 * in "Other" — the UI renders one nav group per bucket, one panel per section.
 */
export const SECTION_GROUPS: Record<string, string> = {
  server: "Core",
  db: "Core",
  frontend: "Core",
  transport: "Core",
  observability: "Core",
  auth: "Security & Access",
  encryption: "Security & Access",
  headers: "Security & Access",
  ageGate: "Security & Access",
  byoKey: "Security & Access",
  generation: "Content & Generation",
  assistant: "Content & Generation",
  templates: "Content & Generation",
  dynamicResponse: "Content & Generation",
  messages: "Content & Generation",
  characters: "Content & Generation",
  nsfw: "Moderation",
  assets: "Assets",
  federation: "Platform",
  hooks: "Platform",
  idempotency: "Platform",
  cron: "Platform",
  seeding: "Platform",
  docs: "Platform",
  logging: "Platform",
  tui: "Platform",
};

/** User settings field types. */
export const USER_FIELD_TYPES: Record<string, ConfigMenuField["type"]> = {
  theme: "string",
  fontSize: "number",
  locale: "string",
  provider: "string",
  apiEndpoint: "string",
  apiKey: "string",
  model: "string",
  temperature: "number",
  maxTokens: "number",
  detailLevel: "enum",
  auto_rename_enabled: "boolean",
  displayName: "string",
  birthDate: "string",
  customInstructions: "string",
  notifications: "object",
};

export function humanize(key: string,): string {
  return key
    .replace(/([A-Z])/g, " $1",)
    .replace(/[_-]+/g, " ",)
    .replace(/^\s*/, "",)
    .replace(/\b\w/g, (c,) => c.toUpperCase(),)
    .trim();
}

/** String-only enum options (the JSON schema may carry a null sentinel). */
export function enumOptions(values: unknown[] | undefined,): string[] | undefined {
  if (!values || values.length === 0) { return undefined; }
  return values.filter((v,): v is string => typeof v === "string");
}

/** Allowed values for user-settings enums keyed by setting name. */
export const USER_FIELD_OPTIONS: Record<string, string[]> = {
  detailLevel: ["Immersion", "Basic", "Detailed",],
};
