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

import type { Config } from "./schema";
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
  readonly nsfw = new NsfwSection();
  readonly generation = new GenerationSection();
  readonly byoKey = new ByoKeySection();
  readonly encryption = new EncryptionSection();
  readonly headers = new HeadersSection();
  readonly dynamicResponse = new DynamicResponseSection();

  constructor(overrides?: Partial<Config>) {
    if (!overrides) return;

    if (overrides.server) {
      Object.assign(this.server, overrides.server);
    }
    if (overrides.db) {
      Object.assign(this.db, overrides.db);
    }
    if (overrides.assets) {
      Object.assign(this.assets, overrides.assets);
    }
    if (overrides.assistant) {
      Object.assign(this.assistant, overrides.assistant);
    }
    if (overrides.logging) {
      Object.assign(this.logging, overrides.logging);
    }
    if (overrides.tui) {
      Object.assign(this.tui, overrides.tui);
    }
    if (overrides.docs) {
      Object.assign(this.docs, overrides.docs);
    }
    if (overrides.ageGate) {
      Object.assign(this.ageGate, overrides.ageGate);
    }
    if (overrides.auth) {
      Object.assign(this.auth, overrides.auth);
    }
    if (overrides.transport) {
      Object.assign(this.transport, overrides.transport);
    }
    if (overrides.messages) {
      Object.assign(this.messages, overrides.messages);
    }
    if (overrides.nsfw) {
      Object.assign(this.nsfw, overrides.nsfw);
    }
    if (overrides.generation) {
      Object.assign(this.generation, overrides.generation);
    }
    if (overrides.byoKey) {
      Object.assign(this.byoKey, overrides.byoKey);
    }
    if (overrides.encryption) {
      Object.assign(this.encryption, overrides.encryption);
    }
    if (overrides.headers) {
      Object.assign(this.headers, overrides.headers);
    }
    if (overrides.dynamicResponse) {
      Object.assign(this.dynamicResponse, overrides.dynamicResponse);
    }
  }

  // ── ENV_MAP generation (auto-walk) ─────────────────────

  /** Build flat ENV_VAR → dot.path mapping from all section fields */
  static envMap(): EnvMap {
    const map: EnvMap = {};
    const s = new ConfigSchema();

    const add = (prefix: string, obj: Record<string, unknown>) => {
      for (const [key, val] of Object.entries(obj)) {
        const path = `${prefix}.${key}`;
        const envKey = path.replaceAll(".", "_").toUpperCase();
        if (val && typeof val === "object" && !Array.isArray(val)) {
          add(path, val as Record<string, unknown>);
        } else {
          map[envKey] = path;
        }
      }
    };

    add("server", s.server as unknown as Record<string, unknown>);
    add("db", s.db as unknown as Record<string, unknown>);
    add("assets", s.assets as unknown as Record<string, unknown>);
    add("assistant", s.assistant as unknown as Record<string, unknown>);
    add("logging", s.logging as unknown as Record<string, unknown>);
    add("tui", s.tui as unknown as Record<string, unknown>);
    add("docs", s.docs as unknown as Record<string, unknown>);
    add("ageGate", s.ageGate as unknown as Record<string, unknown>);
    add("auth", s.auth as unknown as Record<string, unknown>);
    add("transport", s.transport as unknown as Record<string, unknown>);
    add("messages", s.messages as unknown as Record<string, unknown>);
    add("nsfw", s.nsfw as unknown as Record<string, unknown>);
    add("generation", s.generation as unknown as Record<string, unknown>);
    add("byoKey", s.byoKey as unknown as Record<string, unknown>);
    add("encryption", s.encryption as unknown as Record<string, unknown>);
    add("headers", s.headers as unknown as Record<string, unknown>);
    add("dynamicResponse", s.dynamicResponse as unknown as Record<string, unknown>);

    // Manual overrides for renamed/mapped env vars that don't follow
    // the SECTION_FIELD → SECTION_FIELD convention
    const RENAMED: Record<string, string> = {
      PORT: "server.port",
      HOST: "server.host",
      DB_TYPE: "db.type",
      SQLITE_FILENAME: "db.sqliteFilename",
      DATABASE_URL: "db.url",
      ENABLE_ASSETS: "assets.enabled",
      ASSETS_UPLOAD_DIR: "assets.uploadDir",
      ASSETS_MAX_FILE_SIZE: "assets.maxFileSize",
      ASSETS_COMPRESSION: "assets.compression",
      ENABLE_ASSISTANT: "assistant.enabled",
      LOG_LEVEL: "logging.level",
      ENABLE_TUI: "tui.enabled",
      ENABLE_DOCS: "docs.enabled",
      AGE_GATE_ENABLED: "ageGate.enabled",
      AGE_GATE_MINIMUM_AGE: "ageGate.minimumAge",
      AGE_GATE_MODE: "ageGate.mode",
      TLS_KEY: "server.tls.key",
      TLS_CERT: "server.tls.cert",
      AUTH_REQUIRED: "auth.required",
      AUTH_REGISTRATION_OPEN: "auth.registrationOpen",
      SESSION_TIMEOUT_HOURS: "auth.sessionTimeoutHours",
      SESSION_MAX_PER_USER: "auth.maxSessionsPerUser",
      DEMO_USERNAME: "auth.demoUsername",
      DEMO_AUTO_SETUP: "auth.demoAutoSetup",
      AUTH_ADMIN_USERNAME: "auth.adminUsername",
      // eslint-disable-next-line sonarjs/no-hardcoded-passwords
      AUTH_ADMIN_PASSWORD: "auth.adminPassword",
      TRANSPORT_DEFAULT_PROTOCOL: "transport.defaultProtocol",
      TRANSPORT_ENABLE_WEBSOCKET: "transport.enableWebSocket",
      TRANSPORT_ENABLE_WEBTRANSPORT: "transport.enableWebTransport",
      TRANSPORT_ENABLE_H2: "transport.enableH2",
      TRANSPORT_ENABLE_H3: "transport.enableH3",
      TRANSPORT_COMPRESSION_ENABLED: "transport.compression.enabled",
      TRANSPORT_COMPRESSION_DEFAULT: "transport.compression.default",
      TRANSPORT_COMPRESSION_THRESHOLD: "transport.compression.threshold",
      TRANSPORT_MAX_FRAME_SIZE: "transport.limits.maxFrameSize",
      TRANSPORT_MAX_PAYLOAD: "transport.limits.maxPayload",
      TRANSPORT_MAX_CONCURRENT_STREAMS: "transport.limits.maxConcurrentStreams",
      MESSAGE_AUTO_HIDE_INVALID: "messages.autoHideInvalid",
      MESSAGE_HIDE_CONFIRMATION: "messages.hideConfirmation",
      MESSAGE_MAX_LENGTH: "messages.maxLength",
      MESSAGE_MAX_GENERATION_RETRIES: "messages.maxGenerationRetries",
      MESSAGE_GENERATION_TIMEOUT_MS: "messages.generationTimeoutMs",
      MESSAGE_IDEMPOTENCY_EXPIRY_HOURS: "messages.idempotencyExpiryHours",
      ALLOW_NSFW: "nsfw.allowNsfw",
      NSFW_MIN_AGE: "nsfw.nsfwMinAge",
      LLM_DEFAULT_PROVIDER: "generation.defaultProvider",
      BYO_KEY_ENABLED: "byoKey.enabled",
      BYO_KEY_ENCRYPTION_KEY: "byoKey.encryptionKey",
      SERVER_ENCRYPTION_KEY: "encryption.serverEncryptionKey",
      ENCRYPTION_REQUIRED: "encryption.required",
      COMPRESS_THRESHOLD: "encryption.compressThreshold",
      COMPRESS_ALGORITHM: "encryption.compressAlgorithm",
      TESTING_LLAMA_MODEL: "testing.llamaModel",
      TESTING_SD_MODEL: "testing.sdModel",
      TESTING_LLAMA_PORT: "testing.llamaPort",
      TESTING_SD_PORT: "testing.sdPort",
    };

    Object.assign(map, RENAMED);
    return map;
  }

  // ── Validation ─────────────────────────────────────────

  static validate(config: Config): void {
    if (!["sqlite", "postgres"].includes(config.db.type)) {
      throw new Error(`Invalid db.type: "${config.db.type}"`);
    }
    if (config.db.type === "postgres" && !config.db.url) {
      throw new Error("db.url is required when db.type is 'postgres'");
    }
    if (config.server.port < 0 || config.server.port > 65_535) {
      throw new Error(`Invalid server.port: ${config.server.port}. Must be 0-65535`);
    }
    if (!["debug", "info", "warn", "error"].includes(config.logging.level)) {
      throw new Error(`Invalid logging.level: "${config.logging.level}"`);
    }
    for (const p of config.generation.providers.openaiCompatible) {
      if (!p.baseUrl) throw new Error(`Provider "${p.name}" missing baseUrl`);
      if (!p.model) throw new Error(`Provider "${p.name}" missing model`);
    }
    if (config.generation.providers.anthropic && !config.generation.providers.anthropic.apiKey) {
      throw new Error("generation.providers.anthropic requires apiKey");
    }
    if (
      config.headers.xFrameOptions !== null
      && !["DENY", "SAMEORIGIN"].includes(config.headers.xFrameOptions)
    ) {
      throw new Error(`Invalid headers.xFrameOptions: "${config.headers.xFrameOptions}"`);
    }
    if (
      config.headers.crossOriginOpenerPolicy !== null
      && !["same-origin", "same-origin-allow-popups"].includes(config.headers.crossOriginOpenerPolicy)
    ) {
      throw new Error(`Invalid headers.crossOriginOpenerPolicy: "${config.headers.crossOriginOpenerPolicy}"`);
    }
    if (
      config.headers.crossOriginEmbedderPolicy !== null
      && config.headers.crossOriginEmbedderPolicy !== "require-corp"
    ) {
      throw new Error(
        `Invalid headers.crossOriginEmbedderPolicy: "${config.headers.crossOriginEmbedderPolicy as string}"`,
      );
    }
    if (
      config.headers.crossOriginResourcePolicy !== null
      && !["same-origin", "cross-origin"].includes(config.headers.crossOriginResourcePolicy)
    ) {
      throw new Error(
        `Invalid headers.crossOriginResourcePolicy: "${config.headers.crossOriginResourcePolicy}"`,
      );
    }
  }

  // ── JSON Schema generation (auto-build from metadata) ──

  static jsonSchema(): JSONSchema {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "./schemas/loop-lore-config.schema.json",
      title: "loop-lore Config",
      type: "object",
      properties: Object.fromEntries(Object.entries(SECTION_METAS).map(([key, meta]) => [key, meta])),
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
    };
  }
}

/** Singleton: config class instance for defaults generation */
export const configSchema = new ConfigSchema();
