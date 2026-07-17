// src/config/schema-class.ts — Class-based config: single source of truth
//
// Each section is a class. Instance = defaults. Static methods generate
// env-maps, validation, and JSON Schema. Replaces hand-duplicated:
//   - generate-schema.ts (JSON schema defaults)
//   - load.ts ENV_MAP (env var → dot.path mapping)
//   - load.ts validateConfig (validation rules)
//
// schema.ts provides the type interfaces consumed here via `satisfies`.
// This file is the sole source of truth for defaults, env-map, validation, and JSON Schema.

import type {
  Config,
  ServerConfig,
  DbConfig as DatabaseConfig,
  AssetsConfig,
  AssistantConfig,
  LoggingConfig,
  TuiConfig,
  DocumentationConfig,
  AgeGateConfig,
  AuthConfig,
  TransportConfig,
  TransportCompressionConfig,
  TransportLimitsConfig,
  MessagesConfig,
  NsfwConfig,
  GenerationConfig,
  GenerationProvidersConfig,
  ProviderInstanceConfig,
  ByoKeyConfig,
  EncryptionConfig,
  HeadersConfig,
  DynamicResponseConfig,
  ModelRoleAssignment,
} from "./schema";
import { DbType, LogLevel, AgeGateMode } from "../db/enums";
import { DATA_DIR } from "./constants";

// ── Base types ──────────────────────────────────────────────

type EnvMap = Record<string, string>;
type JSONSchema = Record<string, unknown>;

// ── Schema generator ────────────────────────────────────────

// ── Config class collection ─────────────────────────────────

export class ConfigSchema {
  // ── Section instances (defaults) ───────────────────────

  readonly server = {
    port: 3000,
    host: "localhost",
    tls: {
      key: `${DATA_DIR}/certs/key.pem`,
      cert: `${DATA_DIR}/certs/cert.pem`,
    },
  } satisfies ServerConfig;

  readonly db = {
    type: DbType.Sqlite,
    sqliteFilename: `${DATA_DIR}/loop-lore.db`,
  } satisfies DatabaseConfig;

  readonly assets = {
    enabled: true,
    uploadDir: `${DATA_DIR}/uploads`,
    maxFileSize: 10_485_760,
    compression: true,
  } satisfies AssetsConfig;

  readonly assistant = { enabled: true } satisfies AssistantConfig;

  readonly logging = {
    level: LogLevel.Debug,
  } satisfies LoggingConfig;

  readonly tui = { enabled: true } satisfies TuiConfig;

  readonly docs = { enabled: true } satisfies DocumentationConfig;

  readonly ageGate = {
    enabled: false,
    minimumAge: 18,
    mode: AgeGateMode.SelfDeclaration,
  } satisfies AgeGateConfig;

  readonly auth = {
    required: false,
    registrationOpen: true,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 10,
    demoUsername: "demo",
    demoAutoSetup: true,
  } satisfies AuthConfig;

  readonly transport = {
    defaultProtocol: "http/1.1" as const,
    enableWebSocket: true,
    enableWebTransport: false,
    enableH2: false,
    enableH3: false,
    compression: {
      enabled: false,
      default: "none" as const,
      threshold: 256,
    } satisfies TransportCompressionConfig,
    limits: {
      maxFrameSize: 0x1_00_00,
      maxPayload: 0x5_00_00,
      maxConcurrentStreams: 100,
    } satisfies TransportLimitsConfig,
  } satisfies TransportConfig;

  readonly messages = {
    autoHideInvalid: false,
    hideConfirmation: true,
    maxLength: 100_000,
    maxGenerationRetries: 3,
    generationTimeoutMs: 30_000,
    idempotencyExpiryHours: 24,
  } satisfies MessagesConfig;

  readonly nsfw = {
    allowNsfw: true,
    nsfwMinAge: 18,
  } satisfies NsfwConfig;

  readonly generation = {
    providers: {
      openaiCompatible: [] as ProviderInstanceConfig[],
    } satisfies GenerationProvidersConfig,
    defaultProvider: "",
    defaultModels: {} as Record<string, string>,
    modelRoles: {} as Record<string, ModelRoleAssignment>,
  } satisfies GenerationConfig;

  readonly byoKey = {
    enabled: true,
  } satisfies ByoKeyConfig;

  readonly encryption = {
    required: false,
    compressThreshold: 128,
    compressAlgorithm: "gzip",
  } satisfies EncryptionConfig;

  readonly headers = {
    enabled: true,
    referrerPolicy: "strict-origin-when-cross-origin",
    xContentTypeOptions: true,
    xFrameOptions: "DENY",
    permissionsPolicy:
      "accelerometer=(), camera=(), display-capture=(), geolocation=(), gyroscope=(), microphone=(), usb=()",
    csp: {
      enabled: true,
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", "wss:", "https:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: true,
      reportOnly: false,
    },
    crossOriginOpenerPolicy: null,
    crossOriginEmbedderPolicy: null,
    crossOriginResourcePolicy: "cross-origin",
    timingAllowOrigin: "",
    immutableHashedAssets: true,
    linkPreload: ["/vendor.js", "/app.js", "/css/app.css"],
    acceptClientHints: [],
    saveData: false,
    earlyHints: { enabled: false },
    reportingEndpoints: {},
    nel: null,
  } satisfies HeadersConfig;

  readonly dynamicResponse = {
    enabled: true,
    minify: true,
    validate: true,
    compress: true,
    compressAlgorithm: "auto",
    compressThreshold: 512,
  } satisfies DynamicResponseConfig;

  // ── ENV_MAP generation ─────────────────────────────────

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

    add("server", s.server);
    add("db", s.db);
    add("assets", s.assets);
    add("assistant", s.assistant);
    add("logging", s.logging);
    add("tui", s.tui);
    add("docs", s.docs);
    add("ageGate", s.ageGate);
    add("auth", s.auth);
    add("transport", s.transport);
    add("messages", s.messages);
    add("nsfw", s.nsfw);
    add("generation", s.generation);
    add("byoKey", s.byoKey);
    add("encryption", s.encryption);
    add("headers", s.headers);
    add("dynamicResponse", s.dynamicResponse);

    // Manual overrides for renamed/mapped env vars
    map.PORT = "server.port";
    map.HOST = "server.host";
    map.DB_TYPE = "db.type";
    map.SQLITE_FILENAME = "db.sqliteFilename";
    map.DATABASE_URL = "db.url";
    map.ENABLE_ASSETS = "assets.enabled";
    map.ASSETS_UPLOAD_DIR = "assets.uploadDir";
    map.ASSETS_MAX_FILE_SIZE = "assets.maxFileSize";
    map.ASSETS_COMPRESSION = "assets.compression";
    map.ENABLE_ASSISTANT = "assistant.enabled";
    map.LOG_LEVEL = "logging.level";
    map.ENABLE_TUI = "tui.enabled";
    map.ENABLE_DOCS = "docs.enabled";
    map.AGE_GATE_ENABLED = "ageGate.enabled";
    map.AGE_GATE_MINIMUM_AGE = "ageGate.minimumAge";
    map.AGE_GATE_MODE = "ageGate.mode";
    map.TLS_KEY = "server.tls.key";
    map.TLS_CERT = "server.tls.cert";
    map.AUTH_REQUIRED = "auth.required";
    map.AUTH_REGISTRATION_OPEN = "auth.registrationOpen";
    map.SESSION_TIMEOUT_HOURS = "auth.sessionTimeoutHours";
    map.SESSION_MAX_PER_USER = "auth.maxSessionsPerUser";
    map.DEMO_USERNAME = "auth.demoUsername";
    map.DEMO_AUTO_SETUP = "auth.demoAutoSetup";
    map.TRANSPORT_DEFAULT_PROTOCOL = "transport.defaultProtocol";
    map.TRANSPORT_ENABLE_WEBSOCKET = "transport.enableWebSocket";
    map.TRANSPORT_ENABLE_WEBTRANSPORT = "transport.enableWebTransport";
    map.TRANSPORT_ENABLE_H2 = "transport.enableH2";
    map.TRANSPORT_ENABLE_H3 = "transport.enableH3";
    map.TRANSPORT_COMPRESSION_ENABLED = "transport.compression.enabled";
    map.TRANSPORT_COMPRESSION_DEFAULT = "transport.compression.default";
    map.TRANSPORT_COMPRESSION_THRESHOLD = "transport.compression.threshold";
    map.TRANSPORT_MAX_FRAME_SIZE = "transport.limits.maxFrameSize";
    map.TRANSPORT_MAX_PAYLOAD = "transport.limits.maxPayload";
    map.TRANSPORT_MAX_CONCURRENT_STREAMS = "transport.limits.maxConcurrentStreams";
    map.MESSAGE_AUTO_HIDE_INVALID = "messages.autoHideInvalid";
    map.MESSAGE_HIDE_CONFIRMATION = "messages.hideConfirmation";
    map.MESSAGE_MAX_LENGTH = "messages.maxLength";
    map.MESSAGE_MAX_GENERATION_RETRIES = "messages.maxGenerationRetries";
    map.MESSAGE_GENERATION_TIMEOUT_MS = "messages.generationTimeoutMs";
    map.MESSAGE_IDEMPOTENCY_EXPIRY_HOURS = "messages.idempotencyExpiryHours";
    map.ALLOW_NSFW = "nsfw.allowNsfw";
    map.NSFW_MIN_AGE = "nsfw.nsfwMinAge";
    map.LLM_DEFAULT_PROVIDER = "generation.defaultProvider";
    map.BYO_KEY_ENABLED = "byoKey.enabled";
    map.BYO_KEY_ENCRYPTION_KEY = "byoKey.encryptionKey";
    map.SERVER_ENCRYPTION_KEY = "encryption.serverEncryptionKey";
    map.ENCRYPTION_REQUIRED = "encryption.required";
    map.COMPRESS_THRESHOLD = "encryption.compressThreshold";
    map.COMPRESS_ALGORITHM = "encryption.compressAlgorithm";
    map.TESTING_LLAMA_MODEL = "testing.llamaModel";
    map.TESTING_SD_MODEL = "testing.sdModel";
    map.TESTING_LLAMA_PORT = "testing.llamaPort";
    map.TESTING_SD_PORT = "testing.sdPort";

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
      config.headers.xFrameOptions !== null &&
      !["DENY", "SAMEORIGIN"].includes(config.headers.xFrameOptions)
    ) {
      throw new Error(`Invalid headers.xFrameOptions: "${config.headers.xFrameOptions}"`);
    }
    if (
      config.headers.crossOriginOpenerPolicy !== null &&
      !["same-origin", "same-origin-allow-popups"].includes(config.headers.crossOriginOpenerPolicy)
    ) {
      throw new Error(`Invalid headers.crossOriginOpenerPolicy: "${config.headers.crossOriginOpenerPolicy}"`);
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
      !["same-origin", "cross-origin"].includes(config.headers.crossOriginResourcePolicy)
    ) {
      throw new Error(
        `Invalid headers.crossOriginResourcePolicy: "${config.headers.crossOriginResourcePolicy}"`,
      );
    }
  }

  // ── JSON Schema generation ─────────────────────────────

  static jsonSchema(): JSONSchema {
    return {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "./schemas/loop-lore-config.schema.json",
      title: "loop-lore Config",
      type: "object",
      properties: {
        server: {
          type: "object",
          description: "HTTP server configuration",
          properties: {
            port: {
              type: "integer",
              minimum: 0,
              maximum: 65_535,
              default: 3000,
              description: "Server port (0 = random)",
            },
            host: { type: "string", default: "localhost", description: "Server host" },
            tls: {
              type: "object",
              description: "TLS certificate configuration",
              properties: {
                key: {
                  type: "string",
                  default: `${DATA_DIR}/certs/key.pem`,
                  description: "Path to TLS private key (PEM)",
                },
                cert: {
                  type: "string",
                  default: `${DATA_DIR}/certs/cert.pem`,
                  description: "Path to TLS certificate (PEM)",
                },
              },
              required: ["key", "cert"],
            },
          },
          required: ["port", "host"],
        },
        db: {
          type: "object",
          description: "Database configuration",
          properties: {
            type: {
              type: "string",
              enum: ["sqlite", "postgres"],
              default: "sqlite",
              description: "Database type",
            },
            sqliteFilename: {
              type: "string",
              default: `${DATA_DIR}/loop-lore.db`,
              description: "SQLite database file path",
            },
            url: { type: "string", description: "PostgreSQL connection URL" },
          },
          required: ["type", "sqliteFilename"],
        },
        assets: {
          type: "object",
          description: "Asset storage configuration",
          properties: {
            enabled: { type: "boolean", default: true, description: "Enable asset uploads" },
            uploadDir: {
              type: "string",
              default: `${DATA_DIR}/uploads`,
              description: "Directory for uploaded assets",
            },
            maxFileSize: {
              type: "integer",
              minimum: 0,
              default: 10_485_760,
              description: "Max upload size in bytes (default 10 MB)",
            },
            compression: { type: "boolean", default: true, description: "Compress uploaded assets" },
          },
          required: ["enabled", "uploadDir", "maxFileSize", "compression"],
        },
        assistant: {
          type: "object",
          description: "Assistant configuration",
          properties: {
            enabled: { type: "boolean", default: true, description: "Enable rule-based assistant" },
          },
          required: ["enabled"],
        },
        logging: {
          type: "object",
          description: "Logging configuration",
          properties: {
            level: {
              type: "string",
              enum: ["debug", "info", "warn", "error"],
              default: "debug",
              description: "Log level",
            },
            jsonlPath: { type: "string", description: "JSONL output path" },
            jsonlMaxBytes: {
              type: "integer",
              default: 104_857_600,
              description: "Max JSONL file bytes before rotation",
            },
            jsonlMaxFiles: { type: "integer", default: 5, description: "Max rotated files to keep" },
            dbEnabled: { type: "boolean", default: false, description: "Enable DB log transport" },
            censorEnabled: { type: "boolean", default: true, description: "PII redaction" },
            censorFields: {
              type: "array",
              items: { type: "string" },
              description: "Extra PII field patterns",
            },
            queueMaxSize: { type: "integer", default: 10_000, description: "Max queue entries" },
            maxMessageBytes: { type: "integer", default: 10_240, description: "Max message string bytes" },
            maxMetaBytes: { type: "integer", default: 102_400, description: "Max meta blob bytes" },
            maxMetaDepth: { type: "integer", default: 5, description: "Max meta recursion depth" },
            maxStackBytes: { type: "integer", default: 5120, description: "Max error stack bytes" },
          },
          required: ["level"],
        },
        tui: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: true, description: "Enable TUI mode" },
          },
          required: ["enabled"],
        },
        docs: {
          type: "object",
          properties: {
            enabled: { type: "boolean", default: true, description: "Enable documentation serving" },
            public: {
              type: "array",
              items: { type: "string" },
              description: "Allowlist of doc path prefixes",
            },
          },
          required: ["enabled"],
        },
        ageGate: {
          type: "object",
          description: "Age verification configuration",
          properties: {
            enabled: { type: "boolean", default: false, description: "Enable age gating" },
            minimumAge: { type: "integer", default: 18, description: "Minimum required age" },
            mode: {
              type: "string",
              enum: ["none", "self-declaration", "verification"],
              default: "self-declaration",
              description: "Age gate mode",
            },
          },
          required: ["enabled", "minimumAge", "mode"],
        },
        auth: {
          type: "object",
          description: "Authentication configuration",
          properties: {
            required: { type: "boolean", default: false, description: "Require remote multi-user auth" },
            registrationOpen: { type: "boolean", default: true, description: "Allow new user registration" },
            sessionTimeoutHours: {
              type: "integer",
              default: 24,
              description: "Idle session timeout in hours",
            },
            maxSessionsPerUser: {
              type: "integer",
              default: 10,
              description: "Max simultaneous sessions per user",
            },
            demoUsername: { type: "string", default: "demo", description: "Demo username" },
            demoAutoSetup: {
              type: "boolean",
              default: true,
              description: "Auto-create sample data on first demo run",
            },
          },
          required: [
            "required",
            "registrationOpen",
            "sessionTimeoutHours",
            "maxSessionsPerUser",
            "demoUsername",
            "demoAutoSetup",
          ],
        },
        transport: {
          type: "object",
          description: "Transport configuration",
          properties: {
            defaultProtocol: {
              type: "string",
              enum: ["http/1.1", "http/2", "http/3", "websocket", "webtransport", "tcp", "tls"],
              default: "http/1.1",
            },
            enableWebSocket: { type: "boolean", default: true },
            enableWebTransport: { type: "boolean", default: false },
            enableH2: { type: "boolean", default: false },
            enableH3: { type: "boolean", default: false },
            compression: {
              type: "object",
              properties: {
                enabled: { type: "boolean", default: false },
                default: { type: "string", enum: ["zstd", "br", "gzip", "none"], default: "none" },
                threshold: { type: "integer", default: 256 },
              },
              required: ["enabled", "default", "threshold"],
            },
            limits: {
              type: "object",
              properties: {
                maxFrameSize: { type: "integer", default: 65_536 },
                maxPayload: { type: "integer", default: 327_680 },
                maxConcurrentStreams: { type: "integer", default: 100 },
              },
              required: ["maxFrameSize", "maxPayload", "maxConcurrentStreams"],
            },
          },
          required: [
            "defaultProtocol",
            "enableWebSocket",
            "enableWebTransport",
            "enableH2",
            "enableH3",
            "compression",
            "limits",
          ],
        },
        messages: {
          type: "object",
          description: "Message configuration",
          properties: {
            autoHideInvalid: {
              type: "boolean",
              default: false,
              description: "Auto-mark invalid messages as hidden",
            },
            hideConfirmation: {
              type: "boolean",
              default: true,
              description: "Require confirmation before hiding",
            },
            maxLength: { type: "integer", default: 100_000, description: "Max content length" },
            maxGenerationRetries: {
              type: "integer",
              default: 3,
              description: "Max auto-retry on LLM failure",
            },
            generationTimeoutMs: {
              type: "integer",
              default: 30_000,
              description: "LLM response timeout in ms",
            },
            idempotencyExpiryHours: {
              type: "integer",
              default: 24,
              description: "Idempotency key TTL in hours",
            },
          },
          required: [
            "autoHideInvalid",
            "hideConfirmation",
            "maxLength",
            "maxGenerationRetries",
            "generationTimeoutMs",
            "idempotencyExpiryHours",
          ],
        },
        nsfw: {
          type: "object",
          description: "NSFW configuration",
          properties: {
            allowNsfw: { type: "boolean", default: true, description: "Allow NSFW content" },
            nsfwMinAge: { type: "integer", default: 18, description: "Minimum age for NSFW content" },
          },
          required: ["allowNsfw", "nsfwMinAge"],
        },
        generation: {
          type: "object",
          description: "LLM generation provider configuration",
          properties: {
            providers: {
              type: "object",
              properties: {
                openaiCompatible: {
                  type: "array",
                  default: [],
                  description: "OpenAI-compatible provider instances",
                },
              },
            },
            defaultProvider: { type: "string", default: "", description: "Default provider name" },
            defaultModels: { type: "object", default: {}, description: "Default model per provider" },
            autoStart: {
              type: "object",
              description: "Auto-spawn external AI servers at startup",
              properties: {
                llamaCpp: {
                  type: "object",
                  description: "Spawn llama.cpp server as child process",
                  properties: {
                    enabled: { type: "boolean", default: false, description: "Enable auto-start" },
                    modelPath: { type: "string", description: "GGUF path or HF ref (org/repo:quant)" },
                    port: { type: "integer", default: 9011, description: "llama-server port" },
                    alias: { type: "string", description: "Model alias for API reference" },
                    ctxSize: { type: "integer", default: 8192, description: "Context size in tokens" },
                    threads: { type: "integer", description: "CPU threads (-1 = auto)" },
                    nGpuLayers: { type: "string", description: "GPU layers: number, auto, or all" },
                    device: { type: "string", description: "Comma-separated GPU device list" },
                    mlock: { type: "boolean", description: "Force model to stay in RAM" },
                    cacheTypeK: {
                      type: "string",
                      description: "KV cache type for K: f32, f16, q8_0, iq4_nl...",
                    },
                    cacheTypeV: { type: "string", description: "KV cache type for V" },
                    cacheRam: { type: "integer", description: "KV cache RAM budget in MiB" },
                    flashAttn: { type: "string", description: "Flash attention: on, off, or auto" },
                    swaFull: { type: "boolean", description: "Use full-size SWA cache" },
                    ropeScaling: { type: "string", description: "RoPE scaling: none, linear, yarn" },
                    ropeScale: { type: "number", description: "RoPE context scaling factor" },
                    temp: { type: "number", description: "Temperature sampler default" },
                    topK: { type: "integer", description: "Top-K sampler default" },
                    topP: { type: "number", description: "Top-P sampler default" },
                    minP: { type: "number", description: "Min-P sampler default" },
                    repeatPenalty: { type: "number", description: "Repeat penalty" },
                    parallelRequests: { type: "integer", description: "Max parallel requests" },
                    fit: { type: "boolean", description: "Flash inference tuning" },
                    specType: {
                      type: "string",
                      description: "Speculative decoding: draft-eagle3, ngram-map-k4v...",
                    },
                    specDraftNMin: { type: "integer", description: "Min draft tokens for spec decoding" },
                    specDraftNMax: { type: "integer", description: "Max draft tokens for spec decoding" },
                    reasoningBudget: {
                      type: "integer",
                      description: "Reasoning budget in tokens (-1 = unlimited)",
                    },
                    jinja: { type: "boolean", description: "Enable Jinja templates (default enabled)" },
                    extraArgs: { type: "array", items: { type: "string" }, description: "Extra CLI args" },
                  },
                  required: ["enabled", "modelPath", "port"],
                },
                sdCpp: {
                  type: "object",
                  description: "Spawn sd-server as child process",
                  properties: {
                    enabled: { type: "boolean", default: false, description: "Enable auto-start" },
                    modelType: {
                      type: "string",
                      enum: ["checkpoint", "diffusion"],
                      default: "checkpoint",
                      description:
                        "checkpoint = standalone (-m), diffusion = component (--diffusion-model, needs llm)",
                    },
                    modelPath: { type: "string", description: "Path to .safetensors model" },
                    port: { type: "integer", default: 9010, description: "sd-server port" },
                    llmPath: {
                      type: "string",
                      description: "LLM text encoder GGUF. Needed for most diffusion models.",
                    },
                    clipLPath: { type: "string", description: "CLIP-L text encoder (SD1.x/SD2.x)" },
                    clipGPath: { type: "string", description: "CLIP-G text encoder" },
                    t5xxlPath: { type: "string", description: "T5-XXL text encoder" },
                    vaePath: { type: "string", description: "VAE safetensors path" },
                    vaeFormat: { type: "string", description: "VAE latent format: auto, flux, sd3, flux2" },
                    controlNetPath: { type: "string", description: "Control net model path" },
                    loraDir: { type: "string", description: "LoRA directory path" },
                    taesdPath: { type: "string", description: "TAESD for fast low-quality decode" },
                    hiresUpscalersDir: {
                      type: "string",
                      description: "Highres fix upscaler model directory",
                    },
                    embdDir: { type: "string", description: "Embeddings directory" },
                    photoMakerPath: { type: "string", description: "PhotoMaker model path" },
                    upscaleModelPath: { type: "string", description: "ESRGAN upscale model path" },
                    fa: { type: "boolean", description: "Global flash attention" },
                    diffusionFA: { type: "boolean", description: "Flash attention in diffusion model only" },
                    vaeTiling: { type: "boolean", description: "Process VAE in tiles to reduce memory" },
                    eagerLoad: { type: "boolean", description: "Load all params at model-load time" },
                    offloadToCPU: {
                      type: "boolean",
                      description: "Place weights in RAM, load to VRAM on demand",
                    },
                    streamLayers: {
                      type: "boolean",
                      description: "Enable residency+prefetch streaming (needs maxVram)",
                    },
                    autoFit: {
                      type: "boolean",
                      description: "Auto-pick device placements from model size + VRAM budget",
                    },
                    maxVram: { type: "string", description: "Max VRAM budget in GiB" },
                    backend: {
                      type: "string",
                      description: "Runtime backend: e.g. clip=cpu,vae=cuda0,diffusion=vulkan0",
                    },
                    rng: { type: "string", description: "RNG: std_default, cuda, cpu" },
                    samplerRng: { type: "string", description: "Sampler RNG. Defaults to --rng." },
                    type: { type: "string", description: "Weight type: f32, f16, q4_0, q8_0, etc." },
                    prediction: {
                      type: "string",
                      description: "Prediction type: eps, v, edm_v, sd3_flow, flux_flow",
                    },
                    cacheMode: { type: "string", description: "Cache: easycache, ucache, dbcache, spectrum" },
                    cacheOption: { type: "string", description: "Cache params (key=value, comma-separated)" },
                    extraArgs: { type: "array", items: { type: "string" }, description: "Extra CLI args" },
                  },
                  required: ["enabled", "modelType", "modelPath", "port"],
                },
              },
            },
          },
        },
        byoKey: {
          type: "object",
          description: "BYO API Key configuration",
          properties: {
            enabled: { type: "boolean", default: true, description: "Enable user-owned API keys" },
            encryptionKey: { type: "string", description: "Encryption key for stored API keys" },
          },
          required: ["enabled"],
        },
        headers: {
          type: "object",
          description: "Response-header policy (browser security / isolation / perf / observability)",
          properties: {
            enabled: { type: "boolean", default: true, description: "Master toggle for header injection" },
            referrerPolicy: {
              type: "string",
              default: "strict-origin-when-cross-origin",
              description: "Referrer-Policy value",
            },
            xContentTypeOptions: {
              type: "boolean",
              default: true,
              description: "Emit X-Content-Type-Options: nosniff",
            },
            xFrameOptions: {
              type: ["string", "null"],
              enum: ["DENY", "SAMEORIGIN", null],
              default: "DENY",
              description: "X-Frame-Options; null omits",
            },
            permissionsPolicy: {
              type: "string",
              default: "accelerometer=(), camera=(), geolocation=(), microphone=(), usb=()",
              description: "Permissions-Policy feature delegation",
            },
            csp: {
              type: "object",
              description: "Content-Security-Policy directive set (HTML only)",
              properties: {
                enabled: { type: "boolean", default: true },
                defaultSrc: { type: "array", items: { type: "string" }, default: ["'self'"] },
                scriptSrc: {
                  type: "array",
                  items: { type: "string" },
                  default: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
                },
                styleSrc: {
                  type: "array",
                  items: { type: "string" },
                  default: ["'self'", "'unsafe-inline'"],
                },
                imgSrc: { type: "array", items: { type: "string" }, default: ["'self'", "data:", "blob:"] },
                fontSrc: { type: "array", items: { type: "string" }, default: ["'self'"] },
                connectSrc: {
                  type: "array",
                  items: { type: "string" },
                  default: ["'self'", "wss:", "https:"],
                },
                objectSrc: { type: "array", items: { type: "string" }, default: ["'none'"] },
                baseUri: { type: "array", items: { type: "string" }, default: ["'self'"] },
                frameAncestors: { type: "array", items: { type: "string" }, default: ["'none'"] },
                formAction: { type: "array", items: { type: "string" }, default: ["'self'"] },
                upgradeInsecureRequests: { type: "boolean", default: true },
                reportOnly: {
                  type: "boolean",
                  default: false,
                  description: "Emit CSP as Report-Only (observe, not enforce)",
                },
              },
              required: ["enabled"],
            },
            crossOriginOpenerPolicy: {
              type: ["string", "null"],
              enum: ["same-origin", "same-origin-allow-popups", null],
              default: null,
              description: "COOP; null omits",
            },
            crossOriginEmbedderPolicy: {
              type: ["string", "null"],
              enum: ["require-corp", null],
              default: null,
              description:
                "COEP; self-hosted Alpine/htmx resolved CDN blocker. Still not needed (no wasm/SAB).",
            },
            crossOriginResourcePolicy: {
              type: ["string", "null"],
              enum: ["same-origin", "cross-origin", null],
              default: "cross-origin",
              description: "CORP for static subresources",
            },
            timingAllowOrigin: {
              type: "string",
              default: "",
              description: "Timing-Allow-Origin; empty string omits",
            },
            immutableHashedAssets: {
              type: "boolean",
              default: true,
              description: "Append immutable to Cache-Control for content-hashed assets",
            },
            linkPreload: {
              type: "array",
              items: { type: "string" },
              default: ["/vendor.js", "/app.js", "/css/app.css"],
              description: "Link preload hints for HTML documents",
            },
            acceptClientHints: {
              type: "array",
              items: { type: "string" },
              default: [],
              description: "Accept-CH / Critical-CH client hint tokens",
            },
            saveData: { type: "boolean", default: false, description: "Advertise Save-Data cooperativeness" },
            earlyHints: {
              type: "object",
              properties: { enabled: { type: "boolean", default: false } },
              required: ["enabled"],
            },
            reportingEndpoints: {
              type: "object",
              additionalProperties: { type: "string" },
              default: {},
              description: "Reporting-Endpoints name → URL",
            },
            nel: { type: ["string", "null"], default: null, description: "NEL policy JSON; null omits" },
          },
          required: ["enabled", "referrerPolicy", "xContentTypeOptions", "csp", "earlyHints"],
        },
        dynamicResponse: {
          type: "object",
          description:
            "Dynamic-response optimization (minify / validate / compress runtime HTML/CSS/JS/JSON)",
          properties: {
            enabled: { type: "boolean", default: true, description: "Master toggle" },
            minify: {
              type: "boolean",
              default: true,
              description: "Strip whitespace + comments from text bodies",
            },
            validate: {
              type: "boolean",
              default: true,
              description: "Validate html/css/js parse; skip minify + log on failure",
            },
            compress: {
              type: "boolean",
              default: true,
              description: "Apply Content-Encoding based on Accept-Encoding",
            },
            compressAlgorithm: {
              type: "string",
              enum: ["br", "gzip", "auto"],
              default: "auto",
              description: "Preferred algorithm; auto prefers br when advertised",
            },
            compressThreshold: {
              type: "number",
              default: 512,
              description: "Minimum body size (bytes) before compression",
            },
          },
          required: ["enabled", "minify", "validate", "compress", "compressAlgorithm", "compressThreshold"],
        },
      },
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
