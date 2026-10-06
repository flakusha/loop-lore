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

import { PER_CHAT_OVERRIDABLE_KEYS, REQUIRES_RESTART_KEYS, SECRET_KEY_PATTERN, } from "../../admin/config-keys";
import { SettingsUpdateAllowedKeys, } from "../../validation/schemas";
import { jsonSchema, } from "../schema-class";
import type { StandaloneKey, } from "./menu-data";
import {
  EDITABLE_KEY_MAP,
  enumOptions,
  humanize,
  SECTION_GROUPS,
  STANDALONE_KEYS,
  USER_FIELD_OPTIONS,
  USER_FIELD_TYPES,
} from "./menu-data";

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
  /** Allowed values when type is "enum" (from the JSON schema). */
  options?: string[];
}

export interface ConfigMenuSection {
  key: string;
  title: string;
  description?: string;
  /** UI grouping bucket (domain) for navigable panels. */
  group?: string;
  scope: ConfigMenuScope;
  fields: ConfigMenuField[];
}

/** Catalog field for a standalone system_config key. Every flag is derived
 * from the key itself, so both emission sites (into a section that already
 * exists, and into a synthetic orphan section) build the identical field.
 * @param sk the standalone key descriptor
 * @returns {ConfigMenuField}
 */
function standaloneField(sk: StandaloneKey,): ConfigMenuField {
  return {
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
  };
}

function buildAdminSections(): ConfigMenuSection[] {
  const schema = jsonSchema();
  const props = (schema.properties ?? {}) as Record<
    string,
    {
      type?: string;
      description?: string;
      properties?: Record<string, { type?: string; description?: string; default?: unknown; enum?: unknown[] }>;
    }
  >;

  const sections: ConfigMenuSection[] = [];
  const consumedStandalone = new Set<string>();

  for (const [sectionKey, sectionMeta,] of Object.entries(props,)) {
    if (sectionMeta.type !== "object" || !sectionMeta.properties) { continue; }
    const fields: ConfigMenuField[] = [];
    const editableMap = EDITABLE_KEY_MAP[sectionKey] ?? {};

    for (const [fieldName, fieldMeta,] of Object.entries(sectionMeta.properties,)) {
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
        options: enumOptions(fieldMeta.enum,),
      },);
    }

    for (const sk of STANDALONE_KEYS.filter((s,) => s.section === sectionKey)) {
      consumedStandalone.add(sk.key,);
      fields.push(standaloneField(sk,),);
    }

    if (fields.length > 0) {
      sections.push({
        key: sectionKey,
        title: humanize(sectionKey,),
        description: sectionMeta.description,
        group: SECTION_GROUPS[sectionKey] ?? "Other",
        scope: "admin",
        fields,
      },);
    }
  }

  // Standalone keys whose nominal section has no JSON-schema object (e.g.
  // "moderation") would otherwise vanish from the catalog. Emit one synthetic
  // section per orphan bucket so every editable key stays reachable.
  for (const sk of STANDALONE_KEYS.filter((s,) => !consumedStandalone.has(s.key,))) {
    const existing = sections.find((s,) => s.key === sk.section);
    const field = standaloneField(sk,);

    if (existing) {
      existing.fields.push(field,);
    } else {
      sections.push({
        key: sk.section,
        title: humanize(sk.section,),
        group: SECTION_GROUPS[sk.section] ?? "Other",
        scope: "admin",
        fields: [field,],
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
    options: USER_FIELD_OPTIONS[key],
  }));

  return [
    {
      key: "preferences",
      title: "Preferences",
      description: "Your personal settings",
      group: "Preferences",
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
