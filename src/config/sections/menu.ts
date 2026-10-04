// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Config menu catalog builder.
 *
 * Derives a navigable menu model from the config schema metadata (jsonSchema)
 * and the system_config key registry. Two scopes:
 * - "admin": all config sections, editable where a system_config key exists
 * - "user": only the user-settings subset (SettingsUpdateAllowedKeys)
 *
 * Pure module — no DB access, no I/O.
 */

import { jsonSchema, } from "../schema-class";
import { SECRET_KEY_PATTERN, REQUIRES_RESTART_KEYS, PER_CHAT_OVERRIDABLE_KEYS, } from "../../admin/config-keys";
import { SettingsUpdateAllowedKeys, } from "../../validation/schemas";

export type ConfigMenuScope = "admin" | "user";

export interface ConfigMenuField {
  key: string;
  path?: string;
  label: string;
  type: "boolean" | "string" | "number" | "enum" | "array" | "object";
  description?: string;
  default?: unknown;
  required: boolean;
  secret: boolean;
  restart: boolean;
  perChat: boolean;
  editable: boolean;
  scope: ConfigMenuScope;
}

export interface ConfigMenuSection {
  key: string;
  title: string;
  description?: string;
  scope: ConfigMenuScope;
  fields: ConfigMenuField[];
}

/** system_config keys that map to config section fields (camelCase → snake). */
const EDITABLE_KEY_MAP: Record<string, Record<string, string>> = {
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
const STANDALONE_KEYS: { key: string; label: string; type: ConfigMenuField["type"]; description: string; section: string }[] = [
  { key: "log_retention_days", label: "Log Retention (days)", type: "number", description: "Audit log retention in days", section: "logging" },
  { key: "archive_retention_days", label: "Archive Retention (days)", type: "number", description: "Chat archive purge retention in days", section: "messages" },
  { key: "memory_keyphrase_recall", label: "Memory Keyphrase Recall", type: "boolean", description: "Inject journal memories on keyphrase match", section: "generation" },
  { key: "memory_keyphrase_recall_limit", label: "Memory Recall Limit", type: "number", description: "Max keyphrase-triggered memory recalls per message", section: "generation" },
  { key: "auto_moderation", label: "Auto-Moderation", type: "boolean", description: "Enable auto-moderation rules", section: "moderation" },
  { key: "profanity_filter", label: "Profanity Filter", type: "boolean", description: "Enable profanity filter", section: "moderation" },
  { key: "spam_detection", label: "Spam Detection", type: "boolean", description: "Enable spam detection", section: "moderation" },
  { key: "max_flags_before_hide", label: "Max Flags Before Hide", type: "number", description: "Auto-hide content after N flags", section: "moderation" },
  { key: "wardrobe_loadout_bridge", label: "Wardrobe Loadout Bridge", type: "boolean", description: "Auto-switch outfit from equipped items", section: "characters" },
];

/** User settings field types. */
const USER_FIELD_TYPES: Record<string, ConfigMenuField["type"]> = {
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

function humanize(key: string,): string {
  return key
    .replace(/([A-Z])/g, " $1",)
    .replace(/[_-]+/g, " ",)
    .replace(/^\s*/, "",)
    .replace(/\b\w/g, (c,) => c.toUpperCase(),)
    .trim();
}

function buildAdminSections(): ConfigMenuSection[] {
  const schema = jsonSchema();
  const props = (schema.properties ?? {}) as Record<string, { type?: string; description?: string; properties?: Record<string, { type?: string; description?: string; default?: unknown; enum?: string[] }> }>;
  const sections: ConfigMenuSection[] = [];

  for (const [sectionKey, sectionMeta] of Object.entries(props,)) {
    if (sectionMeta.type !== "object" || !sectionMeta.properties) { continue; }
    const fields: ConfigMenuField[] = [];
    const editableMap = EDITABLE_KEY_MAP[sectionKey] ?? {};

    for (const [fieldName, fieldMeta] of Object.entries(sectionMeta.properties,)) {
      const snakeKey = editableMap[fieldName];
      const editable = snakeKey !== undefined;
      const secret = SECRET_KEY_PATTERN.test(fieldName,) || SECRET_KEY_PATTERN.test(snakeKey ?? "",);
      const restart = REQUIRES_RESTART_KEYS[snakeKey ?? ""] === true;
      const perChat = PER_CHAT_OVERRIDABLE_KEYS[snakeKey ?? ""] === true;

      fields.push({
        key: snakeKey ?? `${sectionKey}.${fieldName}`,
        path: `${sectionKey}.${fieldName}`,
        label: humanize(fieldName,),
        type: (fieldMeta.type as ConfigMenuField["type"]) ?? "string",
        description: fieldMeta.description,
        default: fieldMeta.default,
        required: false,
        secret,
        restart,
        perChat,
        editable,
        scope: "admin",
      },);
    }

    for (const sk of STANDALONE_KEYS.filter((s,) => s.section === sectionKey,)) {
      fields.push({
        key: sk.key,
        label: sk.label,
        type: sk.type,
        description: sk.description,
        required: false,
        secret: SECRET_KEY_PATTERN.test(sk.key,),
        restart: REQUIRES_RESTART_KEYS[sk.key] === true,
        perChat: PER_CHAT_OVERRIDABLE_KEYS[sk.key] === true,
        editable: true,
        scope: "admin",
      },);
    }

    if (fields.length > 0) {
      sections.push({
        key: sectionKey,
        title: humanize(sectionKey,),
        description: sectionMeta.description,
        scope: "admin",
        fields,
      },);
    }
  }

  return sections;
}

function buildUserSections(): ConfigMenuSection[] {
  const fields: ConfigMenuField[] = SettingsUpdateAllowedKeys.map((key,) => ({
    key,
    label: humanize(key,),
    type: USER_FIELD_TYPES[key] ?? "string",
    required: false,
    secret: key === "apiKey",
    restart: false,
    perChat: false,
    editable: true,
    scope: "user" as const,
  }),);

  return [
    {
      key: "preferences",
      title: "Preferences",
      description: "Your personal settings",
      scope: "user",
      fields,
    },
  ];
}

/**
 * Build the admin config menu (all sections).
 * @returns Every config section with role-scoped editability flags.
 */
export function buildAdminConfigMenu(): ConfigMenuSection[] {
  return buildAdminSections();
}

/**
 * Build the user config menu (settings subset only).
 * @returns The user-scoped settings section.
 */
export function buildUserConfigMenu(): ConfigMenuSection[] {
  return buildUserSections();
}

/**
 * Build the config menu for a given role.
 * @param isAdmin - Whether the caller has the admin.system permission.
 * @returns Admin catalog when admin, otherwise the user settings subset.
 */
export function buildConfigMenu(isAdmin: boolean,): ConfigMenuSection[] {
  return isAdmin ? buildAdminConfigMenu() : buildUserConfigMenu();
}
