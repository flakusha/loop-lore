// src/config/sections/index.ts — Barrel exports for all config sections
//
// Each section provides: defaults constant, class, and schema metadata.
// Used by ConfigSchema orchestrator for envMap, validate, and jsonSchema generation.

export { ServerSection, SERVER_DEFAULTS, serverMeta } from "./server";
export { DatabaseSection, DATABASE_DEFAULTS, databaseMeta } from "./database";
export { AssetsSection, ASSETS_DEFAULTS, assetsMeta } from "./assets";
export { AssistantSection, ASSISTANT_DEFAULTS, assistantMeta } from "./assistant";
export { LoggingSection, LOGGING_DEFAULTS, loggingMeta } from "./logging";
export { TuiSection, TUI_DEFAULTS, tuiMeta } from "./tui";
export { DocsSection, DOCS_DEFAULTS, docsMeta } from "./docs";
export { AgeGateSection, AGE_GATE_DEFAULTS, ageGateMeta } from "./age-gate";
export { AuthSection, AUTH_DEFAULTS, authMeta } from "./auth";
export {
  TransportSection,
  TRANSPORT_DEFAULTS,
  TRANSPORT_COMPRESSION_DEFAULTS,
  TRANSPORT_LIMITS_DEFAULTS,
  transportMeta,
} from "./transport";
export { MessagesSection, MESSAGES_DEFAULTS, messagesMeta } from "./messages";
export { NsfwSection, NSFW_DEFAULTS, nsfwMeta } from "./nsfw";
export { GenerationSection, GENERATION_DEFAULTS, generationMeta } from "./generation";
export { ByoKeySection, BYO_KEY_DEFAULTS, byoKeyMeta } from "./byo-key";
export { EncryptionSection, ENCRYPTION_DEFAULTS, encryptionMeta } from "./encryption";
export { HeadersSection, HEADERS_DEFAULTS, CSP_DEFAULTS, headersMeta } from "./headers";
export { DynamicResponseSection, DYNAMIC_RESPONSE_DEFAULTS, dynamicResponseMeta } from "./dynamic-response";
