// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/index.ts — ConfigSchema factory + barrel
//
// Single source of truth for defaults, env-map, validation, and JSON Schema.
// Replaces hand-duplicated:
//   - generate-schema.ts (JSON schema defaults)
//   - load.ts ENV_MAP (env var → dot.path mapping)
//   - load.ts validateConfig (validation rules)
//
// The section defaults live in sibling modules; the factory deep-clones them so
// each instance stays isolated (matching the original per-instance class fields).

import { AGE_GATE_DEFAULTS, } from "./age-gate";
import { ASSETS_DEFAULTS, } from "./assets";
import { ASSISTANT_DEFAULTS, } from "./assistant";
import { AUTH_DEFAULTS, } from "./auth";
import { BYO_KEY_DEFAULTS, } from "./byo-key";
import { DB_DEFAULTS, } from "./db";
import { DOCS_DEFAULTS, } from "./docs";
import { DYNAMIC_RESPONSE_DEFAULTS, } from "./dynamic-response";
import { ENCRYPTION_DEFAULTS, } from "./encryption";
import { FRONTEND_DEFAULTS, } from "./frontend";
import { GENERATION_DEFAULTS, } from "./generation";
import { HEADERS_SECTION_DEFAULTS, } from "./headers";
import { HOOKS_DEFAULTS, } from "./hooks";
import { LOGGING_DEFAULTS, } from "./logging";
import { MESSAGES_DEFAULTS, } from "./messages";
import { NSFW_DEFAULTS, } from "./nsfw";
import { SEEDING_DEFAULTS, } from "./seeding";
import { SERVER_DEFAULTS, } from "./server";
import { TRANSPORT_DEFAULTS, } from "./transport";
import { TUI_DEFAULTS, } from "./tui";

import type { Config, } from "../schema";
import { CHARACTERS_DEFAULTS, } from "../sections/characters";
import { TEMPLATES_DEFAULTS, } from "../sections/templates";

/** Recursively copy plain data so each factory instance owns its own objects. */
const deepClone = <T,>(value: T,): T => {
  if (Array.isArray(value,)) {
    return Array.from(value, (item,) => deepClone(item,),) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v,] of Object.entries(value as Record<string, unknown>,)) {
      out[k] = deepClone(v,);
    }
    return out as T;
  }
  return value;
};

export const createConfigSchema = () => {
  const sections = {
    server: deepClone(SERVER_DEFAULTS,),
    db: deepClone(DB_DEFAULTS,),
    assets: deepClone(ASSETS_DEFAULTS,),
    assistant: deepClone(ASSISTANT_DEFAULTS,),
    logging: deepClone(LOGGING_DEFAULTS,),
    tui: deepClone(TUI_DEFAULTS,),
    docs: deepClone(DOCS_DEFAULTS,),
    ageGate: deepClone(AGE_GATE_DEFAULTS,),
    auth: deepClone(AUTH_DEFAULTS,),
    transport: deepClone(TRANSPORT_DEFAULTS,),
    messages: deepClone(MESSAGES_DEFAULTS,),
    nsfw: deepClone(NSFW_DEFAULTS,),
    hooks: deepClone(HOOKS_DEFAULTS,),
    generation: deepClone(GENERATION_DEFAULTS,),
    byoKey: deepClone(BYO_KEY_DEFAULTS,),
    encryption: deepClone(ENCRYPTION_DEFAULTS,),
    headers: deepClone(HEADERS_SECTION_DEFAULTS,),
    dynamicResponse: deepClone(DYNAMIC_RESPONSE_DEFAULTS,),
    frontend: deepClone(FRONTEND_DEFAULTS,),
    seeding: deepClone(SEEDING_DEFAULTS,),
  };

  return {
    ...sections,
    get defaults(): Config {
      return {
        server: sections.server,
        db: sections.db,
        assets: sections.assets,
        assistant: sections.assistant,
        logging: sections.logging,
        tui: sections.tui,
        docs: sections.docs,
        ageGate: sections.ageGate,
        auth: sections.auth,
        transport: sections.transport,
        messages: sections.messages,
        nsfw: sections.nsfw,
        hooks: sections.hooks,
        generation: sections.generation,
        byoKey: sections.byoKey,
        encryption: sections.encryption,
        headers: sections.headers,
        dynamicResponse: sections.dynamicResponse,
        frontend: sections.frontend,
        seeding: sections.seeding,
        templates: TEMPLATES_DEFAULTS,
        characters: CHARACTERS_DEFAULTS,
      };
    },
  };
};

export type ConfigSchema = ReturnType<typeof createConfigSchema>;

/** Singleton: config class instance for defaults generation */
export const configSchema = createConfigSchema();

export { envMap, } from "./env-map";
export { jsonSchema, } from "./json-schema";
export { validate, } from "./validate";
