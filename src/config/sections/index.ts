// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/index.ts — Barrel exports for all config sections
//
// Each section provides: defaults constant, class, and schema metadata.
// Used by ConfigSchema orchestrator for envMap, validate, and jsonSchema generation.

export { AGE_GATE_DEFAULTS, ageGateMeta, AgeGateSection, } from "./age-gate";
export { ASSETS_DEFAULTS, assetsMeta, AssetsSection, } from "./assets";
export { ASSISTANT_DEFAULTS, assistantMeta, AssistantSection, } from "./assistant";
export { AUTH_DEFAULTS, authMeta, AuthSection, } from "./auth";
export { BYO_KEY_DEFAULTS, byoKeyMeta, ByoKeySection, } from "./byo-key";
export { CHARACTERS_DEFAULTS, charactersMeta, CharactersSection, } from "./characters";
export { CRON_DEFAULTS, cronMeta, CronSection, } from "./cron";
export { DATABASE_DEFAULTS, databaseMeta, DatabaseSection, } from "./database";
export { DOCS_DEFAULTS, docsMeta, DocsSection, } from "./docs";
export { DYNAMIC_RESPONSE_DEFAULTS, dynamicResponseMeta, DynamicResponseSection, } from "./dynamic-response";
export { ENCRYPTION_DEFAULTS, encryptionMeta, EncryptionSection, } from "./encryption";
export { GENERATION_DEFAULTS, generationMeta, GenerationSection, } from "./generation";
export { CSP_DEFAULTS, HEADERS_DEFAULTS, headersMeta, HeadersSection, } from "./headers";
export { LOGGING_DEFAULTS, loggingMeta, LoggingSection, } from "./logging";
export { MESSAGES_DEFAULTS, messagesMeta, MessagesSection, } from "./messages";
export { NSFW_DEFAULTS, nsfwMeta, NsfwSection, } from "./nsfw";
export { SERVER_DEFAULTS, serverMeta, ServerSection, } from "./server";
export {
  TRANSPORT_COMPRESSION_DEFAULTS,
  TRANSPORT_DEFAULTS,
  TRANSPORT_LIMITS_DEFAULTS,
  transportMeta,
  TransportSection,
} from "./transport";
export { TUI_DEFAULTS, tuiMeta, TuiSection, } from "./tui";
