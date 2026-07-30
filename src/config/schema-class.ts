// src/config/schema-class.ts — ConfigSchema orchestrator
//
// Delegates to section classes in ./sections/ for defaults + schema metadata.
// Auto-generates envMap by walking section instances.
// Auto-generates jsonSchema from section metadata + defaults.
//
// Replaces hand-duplicated:
//   - generate-schema.ts (JSON schema defaults)
//   - load.ts ENV_MAP (env var → dot.path mapping)
//   - load.ts validateConfig (validation rules)

import type { Config, } from "./schema";
import {
  ageGateMeta,
  AgeGateSection,
  assetsMeta,
  AssetsSection,
  assistantMeta,
  AssistantSection,
  authMeta,
  AuthSection,
  byoKeyMeta,
  ByoKeySection,
  databaseMeta,
  DatabaseSection,
  docsMeta,
  DocsSection,
  dynamicResponseMeta,
  DynamicResponseSection,
  encryptionMeta,
  EncryptionSection,
  generationMeta,
  GenerationSection,
  headersMeta,
  HeadersSection,
  loggingMeta,
  LoggingSection,
  messagesMeta,
  MessagesSection,
  nsfwMeta,
  NsfwSection,
  serverMeta,
  ServerSection,
  transportMeta,
  TransportSection,
  tuiMeta,
  TuiSection,
} from "./sections";

// ── Base types ──────────────────────────────────────────────

import { AgeGateMode, DbType, LogLevel, } from "../db/enums";
import { DATA_DIR, } from "./constants";
import {
  TEMPLATES_DEFAULTS,
} from "./sections/templates";

import {
  CHARACTERS_DEFAULTS,
} from "./sections/characters";


// src/config/schema-class.ts — ConfigSchema orchestrator
//
// Delegates to section classes in ./sections/ for defaults + schema metadata.
// Auto-generates envMap by walking section instances.
// Auto-generates jsonSchema from section metadata + defaults.
//
// Replaces hand-duplicated:
//   - generate-schema.ts (JSON schema defaults)
//   - load.ts ENV_MAP (env var → dot.path mapping)
//   - load.ts validateConfig (validation rules)
// ── Base types ──────────────────────────────────────────────

type EnvMap = Record<string, string>;
type JSONSchema = Record<string, unknown>;

// ── Schema metadata map (section key → meta) ────────────────

const SECTION_METAS = {
  server: serverMeta,
  db: databaseMeta,
  assets: assetsMeta,
  assistant: assistantMeta,
  logging: loggingMeta,
  tui: tuiMeta,
  docs: docsMeta,
  ageGate: ageGateMeta,
  auth: authMeta,
  transport: transportMeta,
  messages: messagesMeta,
  nsfw: nsfwMeta,
  generation: generationMeta,
  byoKey: byoKeyMeta,
  encryption: encryptionMeta,
  headers: headersMeta,
  dynamicResponse: dynamicResponseMeta,
} as const;

// ── Config class collection ─────────────────────────────────

export class ConfigSchema {
  // ── Section instances (defaults) ───────────────────────

  readonly server = new ServerSection();

  readonly db = new DatabaseSection();

  readonly assets = new AssetsSection();

  readonly assistant = new AssistantSection();

  readonly logging = new LoggingSection();

  readonly tui = new TuiSection();

  readonly docs = new DocsSection();

  readonly ageGate = new AgeGateSection();

  readonly auth = new AuthSection();

  readonly transport = new TransportSection();

  readonly messages = new MessagesSection();

"26: @ours\n27: @ours"

"21: @ours\n22: @ours"

  readonly byoKey = new ByoKeySection();

  readonly encryption = new EncryptionSection();

  readonly headers = new HeadersSection();

  readonly dynamicResponse = new DynamicResponseSection();

  constructor(overrides?: Partial<Config>,) {
    if (!overrides) { return; }

    if (overrides.server) {
      Object.assign(this.server, overrides.server,);
    }
    if (overrides.db) {
      Object.assign(this.db, overrides.db,);
    }
    if (overrides.assets) {
      Object.assign(this.assets, overrides.assets,);
    }
    if (overrides.assistant) {
      Object.assign(this.assistant, overrides.assistant,);
    }
    if (overrides.logging) {
      Object.assign(this.logging, overrides.logging,);
    }
    if (overrides.tui) {
      Object.assign(this.tui, overrides.tui,);
    }
    if (overrides.docs) {
      Object.assign(this.docs, overrides.docs,);
    }
    if (overrides.ageGate) {
      Object.assign(this.ageGate, overrides.ageGate,);
    }
    if (overrides.auth) {
      Object.assign(this.auth, overrides.auth,);
    }
    if (overrides.transport) {
      Object.assign(this.transport, overrides.transport,);
    }
    if (overrides.messages) {
      Object.assign(this.messages, overrides.messages,);
    }
    if (overrides.nsfw) {
      Object.assign(this.nsfw, overrides.nsfw,);
    }
    if (overrides.generation) {
      Object.assign(this.generation, overrides.generation,);
    }
    if (overrides.byoKey) {
      Object.assign(this.byoKey, overrides.byoKey,);
    }
    if (overrides.encryption) {
      Object.assign(this.encryption, overrides.encryption,);
    }
    if (overrides.headers) {
      Object.assign(this.headers, overrides.headers,);
    }
    if (overrides.dynamicResponse) {
      Object.assign(this.dynamicResponse, overrides.dynamicResponse,);
    }
  }

"26: @ours\n27: @ours"
    return map;
  }

  // ── Validation ─────────────────────────────────────────

  static validate(config: Config,): void {
    if (!["sqlite", "postgres",].includes(config.db.type,)) {
      throw new Error(`Invalid db.type: "${config.db.type}"`,);
    }
    if (config.db.type === "postgres" && !config.db.url) {
      throw new Error("db.url is required when db.type is 'postgres'",);
    }
    if (config.server.port < 0 || config.server.port > 65_535) {
      throw new Error(`Invalid server.port: ${config.server.port}. Must be 0-65535`,);
    }
    if (!["debug", "info", "warn", "error",].includes(config.logging.level,)) {
      throw new Error(`Invalid logging.level: "${config.logging.level}"`,);
    }
    for (const p of config.generation.providers.openaiCompatible) {
      if (!p.baseUrl) { throw new Error(`Provider "${p.name}" missing baseUrl`,); }
      if (!p.model) { throw new Error(`Provider "${p.name}" missing model`,); }
    }
    if (config.generation.providers.anthropic && !config.generation.providers.anthropic.apiKey) {
      throw new Error("generation.providers.anthropic requires apiKey",);
    }
    if (
      config.headers.xFrameOptions !== null &&
      !["DENY", "SAMEORIGIN",].includes(config.headers.xFrameOptions,)
    ) {
      throw new Error(`Invalid headers.xFrameOptions: "${config.headers.xFrameOptions}"`,);
    }
    if (
      config.headers.crossOriginOpenerPolicy !== null &&
      !["same-origin", "same-origin-allow-popups",].includes(config.headers.crossOriginOpenerPolicy,)
    ) {
      throw new Error(`Invalid headers.crossOriginOpenerPolicy: "${config.headers.crossOriginOpenerPolicy}"`,);
    }
    if (
      config.headers.crossOriginEmbedderPolicy !== null &&
      config.headers.crossOriginEmbedderPolicy !== "require-corp"
    ) {
      throw new Error(
        `Invalid headers.crossOriginEmbedderPolicy: "${config.headers.crossOriginEmbedderPolicy as string}"`,
      );
    }
    if (
      config.headers.crossOriginResourcePolicy !== null &&
      !["same-origin", "cross-origin",].includes(config.headers.crossOriginResourcePolicy,)
    ) {
      throw new Error(
        `Invalid headers.crossOriginResourcePolicy: "${config.headers.crossOriginResourcePolicy}"`,
      );
    }
  }

      required: [
        "server",
        "db",
        "assets",
        "assistant",
        "logging",
        "tui",
        "docs",
        "auth",
        "transport",
        "messages",
        "encryption",
        "headers",
        "dynamicResponse",
        "frontend",
      ],
    };
  }

  // ── Full config ────────────────────────────────────────

  get defaults(): Config {
    return {
      server: this.server,
      db: this.db,
      assets: this.assets,
      assistant: this.assistant,
      logging: this.logging,
      tui: this.tui,
      docs: this.docs,
      ageGate: this.ageGate,
      auth: this.auth,
      transport: this.transport,
      messages: this.messages,
      nsfw: this.nsfw,
      generation: this.generation,
      byoKey: this.byoKey,
      encryption: this.encryption,
      headers: this.headers,
      dynamicResponse: this.dynamicResponse,
      frontend: this.frontend,
      templates: TEMPLATES_DEFAULTS,
      characters: CHARACTERS_DEFAULTS,
    };
  }

  readonly frontend = {
    mode: "htmx" as const,
  } satisfies FrontendConfig;
}

/** Singleton: config class instance for defaults generation */
export const configSchema = new ConfigSchema();
