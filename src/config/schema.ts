// src/config/schema.ts — Config interface + defaults
//
// Enum types sourced from ../db/enums

import { DbType, LogLevel, AgeGateMode } from "../db/enums";
import type { DbType as DbTypeT, LogLevel as LogLevelT, AgeGateMode as AgeGateModeT } from "../db/enums";

interface TlsConfig {
  /** Path to TLS private key (PEM). Auto-generated if missing. */
  key: string;
  /** Path to TLS certificate (PEM). Auto-generated if missing. */
  cert: string;
}

interface ServerConfig {
  port: number;
  host: string;
  /** TLS config. If key/cert paths are set, serve HTTPS too. */
  tls?: TlsConfig;
}

interface DatabaseConfig {
  type: DbTypeT;
  sqliteFilename: string;
  url?: string;
}

interface AssetsConfig {
  enabled: boolean;
  uploadDir: string;
  maxFileSize: number;
  compression: boolean;
}

interface AssistantConfig {
  enabled: boolean;
}

interface LoggingConfig {
  level: LogLevelT;
  /** JSONL output path. Unset = disabled. */
  jsonlPath?: string;
  /** Max JSONL file bytes before rotation. Default 100 MB. */
  jsonlMaxBytes?: number;
  /** Max rotated files to keep. Default 5. */
  jsonlMaxFiles?: number;
  /** Enable DB log transport. Default false. */
  dbEnabled?: boolean;
  /** PII censor toggle. Default true. */
  censorEnabled?: boolean;
  /** Extra PII field patterns (merged with defaults). */
  censorFields?: string[];
  /** Max queue entries before dropping. Default 10_000. */
  queueMaxSize?: number;
  /** Max message string bytes before truncation. */
  maxMessageBytes?: number;
  /** Max meta blob bytes before truncation. */
  maxMetaBytes?: number;
  /** Max meta recursion depth. */
  maxMetaDepth?: number;
  /** Max error stack bytes before truncation. */
  maxStackBytes?: number;
}

interface TuiConfig {
  enabled: boolean;
}

interface DocumentationConfig {
  enabled: boolean;
  /**
   * Allowlist of doc path prefixes visible to non-admin users.
   * Empty or absent = all docs visible (default).
   * Example: ["guide", "frontend", "assets"] serves only /docs/guide/*, /docs/frontend/*, /docs/assets.html
   */
  public?: string[];
}

/**
 * Age gate / verification config.
 * When enabled, users must declare their age before using the app.
 * Set enabled=false to skip gating entirely ("internet should be free").
 */
/**
 * Authentication / session config.
 */
interface AuthConfig {
  /** true = remote multi-user auth required, false = demo/solo mode (skip auth) */
  required: boolean;
  /** Allow new user registration */
  registrationOpen: boolean;
  /** Idle session timeout in hours */
  sessionTimeoutHours: number;
  /** Max simultaneous sessions per user */
  maxSessionsPerUser: number;
  /** Demo username (auto-created when auth.required=false) */
  demoUsername: string;
  /** Auto-create sample data on first demo run */
  demoAutoSetup: boolean;
}

interface TransportCompressionConfig {
  /** Master toggle for transport compression */
  enabled: boolean;
  /** Default compression algorithm */
  default: "zstd" | "br" | "gzip" | "none";
  /** Minimum payload size (bytes) before compression kicks in */
  threshold: number;
}

interface TransportLimitsConfig {
  /** Max frame size in bytes. Default 0x10000 (64 KiB) */
  maxFrameSize: number;
  /** Max payload size in bytes. Default 0x50000 (320 KiB) */
  maxPayload: number;
  /** Max concurrent streams (H2). Default 100 */
  maxConcurrentStreams: number;
}

interface TransportConfig {
  /** Default transport protocol */
  defaultProtocol: "http/1.1" | "http/2" | "http/3" | "websocket" | "webtransport" | "tcp" | "tls";
  /** Enable WebSocket upgrade support */
  enableWebSocket: boolean;
  /** Enable WebTransport support (requires H3) */
  enableWebTransport: boolean;
  /** Enable HTTP/2 support */
  enableH2: boolean;
  /** Enable HTTP/3 support (requires QUIC/Bun support) */
  enableH3: boolean;
  /** Compression settings */
  compression: TransportCompressionConfig;
  /** Connection limits */
  limits: TransportLimitsConfig;
}

interface AgeGateConfig {
  /** Master toggle — false = no gating at all */
  enabled: boolean;
  /** Minimum age required (default: 18) */
  minimumAge: number;
  /**
   * Gating mode:
   * - "none": no gating (same as enabled=false, overrides enabled)
   * - "self-declaration": user enters their birth date, we calculate age
   * - "verification": reserved for future ID-based verification
   */
  mode: AgeGateModeT;
}

// ── LLM / Image Generation Providers ──────────────────────

interface ModelLimits {
  /** Context window size in tokens */
  contextLimit: number;
  /** Max output tokens */
  maxOutput: number;
}

interface ProviderInstanceConfig {
  /** Unique provider instance name (referenced in registry) */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Base URL (e.g. http://localhost:8080/v1) */
  baseUrl: string;
  /** Server-level API key (overridden by user BYO key) */
  apiKey?: string;
  /** Default model ID */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Allow user API key override for this provider */
  allowUserApiKey: boolean;
  /** Extra headers sent with every request */
  headers?: Record<string, string>;
  /** Known models (name → limits) */
  models: Record<string, ModelLimits>;
}

interface ImageProviderDefaults {
  /** Default image width */
  width: number;
  /** Default image height */
  height: number;
  /** Default sampling steps */
  steps: number;
  /** Default CFG scale */
  cfgScale: number;
  /** Default sampler name */
  sampler: string;
}

interface ImageProviderConfig {
  /** Unique provider name */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Base URL */
  baseUrl: string;
  /** API family: openai-compatible, SD WebUI, or SD cpp */
  apiFamily: "openai" | "sdapi" | "sdcpp";
  /** Optional API key */
  apiKey?: string;
  /** Default generation parameters */
  defaults: ImageProviderDefaults;
  /** Connection timeout in ms */
  timeout: number;
  /** Image generation timeout in ms */
  generationTimeout: number;
}

interface GenerationProvidersConfig {
  /** OpenAI-compatible providers (llama.cpp, vLLM, Ollama, LM Studio, etc.) */
  openaiCompatible: ProviderInstanceConfig[];
  /** Anthropic native API provider */
  anthropic?: ProviderInstanceConfig;
  /** Ollama native API provider (separate from openai-compatible mode) */
  ollamaNative?: ProviderInstanceConfig;
  /** Image generation provider (SD, FLUX, etc.) */
  sd?: ImageProviderConfig;
}

interface GenerationConfig {
  /** Provider configurations */
  providers: GenerationProvidersConfig;
  /** Default provider name when none specified per-chat */
  defaultProvider: string;
  /** Default model per provider (providerName → modelId) */
  defaultModels: Record<string, string>;
}

// ── BYO API Key ────────────────────────────────────────────

interface ByoKeyConfig {
  /** Master toggle for user-owned API keys */
  enabled: boolean;
  /** Encryption key for stored API keys (falls back to auth.sessionSecret) */
  encryptionKey?: string;
}

interface MessagesConfig {
  /** Auto-mark invalid messages as hidden */
  autoHideInvalid: boolean;
  /** Require confirmation before hiding */
  hideConfirmation: boolean;
  /** Max content length (plaintext before encrypt) */
  maxLength: number;
  /** Max auto-retry on LLM failure */
  maxGenerationRetries: number;
  /** LLM response timeout in ms */
  generationTimeoutMs: number;
  /** Idempotency key TTL in hours */
  idempotencyExpiryHours: number;
}

interface NsfwConfig {
  /** Allow NSFW content in chats. Default true. */
  allowNsfw: boolean;
  /** Minimum age for NSFW content. Checked against user birth_date. Default 18. */
  nsfwMinAge: number;
}

interface Config {
  server: ServerConfig;
  db: DatabaseConfig;
  assets: AssetsConfig;
  assistant: AssistantConfig;
  logging: LoggingConfig;
  tui: TuiConfig;
  docs: DocumentationConfig;
  ageGate: AgeGateConfig;
  auth: AuthConfig;
  transport: TransportConfig;
  messages: MessagesConfig;
  nsfw: NsfwConfig;
  generation: GenerationConfig;
  byoKey: ByoKeyConfig;
}
const DEFAULTS: Config = {
  server: {
    port: 3000,
    host: "localhost",
    tls: {
      key: "./data/certs/key.pem",
      cert: "./data/certs/cert.pem",
    },
  },
  db: {
    type: DbType.Sqlite,
    sqliteFilename: "../loop-lore-data/loop-lore.db",
  },
  assets: {
    enabled: true,
    uploadDir: "../loop-lore-data/uploads",
    maxFileSize: 10_485_760,
    compression: true,
  },
  assistant: {
    enabled: true,
  },
  logging: {
    level: LogLevel.Debug,
  },
  tui: {
    enabled: true,
  },
  docs: {
    enabled: true,
  },
  ageGate: {
    enabled: false,
    minimumAge: 18,
    mode: AgeGateMode.SelfDeclaration,
  },
  auth: {
    required: false,
    registrationOpen: true,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 10,
    demoUsername: "demo",
    demoAutoSetup: true,
  },
  transport: {
    defaultProtocol: "http/1.1",
    enableWebSocket: true,
    enableWebTransport: false,
    enableH2: false,
    enableH3: false,
    compression: {
      enabled: false,
      default: "none",
      threshold: 256,
    },
    limits: {
      maxFrameSize: 0x1_00_00,
      maxPayload: 0x5_00_00,
      maxConcurrentStreams: 100,
    },
  },
  messages: {
    autoHideInvalid: false,
    hideConfirmation: true,
    maxLength: 100_000,
    maxGenerationRetries: 3,
    generationTimeoutMs: 30_000,
    idempotencyExpiryHours: 24,
  },
  nsfw: {
    allowNsfw: true,
    nsfwMinAge: 18,
  },
  generation: {
    providers: {
      openaiCompatible: [],
    },
    defaultProvider: "",
    defaultModels: {},
  },
  byoKey: {
    enabled: true,
  },
};

export type {
  Config,
  ServerConfig,
  TlsConfig,
  DatabaseConfig as DbConfig,
  AssetsConfig,
  AssistantConfig,
  LoggingConfig,
  TuiConfig,
  DocumentationConfig,
  AgeGateConfig,
  AuthConfig,
  TransportConfig,
  MessagesConfig,
  NsfwConfig,
  GenerationConfig,
  GenerationProvidersConfig,
  ProviderInstanceConfig,
  ImageProviderConfig,
  ImageProviderDefaults,
  ModelLimits,
  ByoKeyConfig,
};
export { DEFAULTS };
