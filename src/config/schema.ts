// src/config/schema.ts — Config type definitions
//
// Types only. Defaults live in ConfigSchema class (schema-class.ts) —
// single source of truth for env-map, validation, and JSON Schema generation.
//
// Enum types sourced from ../db/enums

import type { AgeGateMode as AgeGateModeT, DbType as DbTypeT, LogLevel as LogLevelT } from "../db/enums";

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

interface DynamicResponseConfig {
  /** Master toggle for dynamic-response optimization */
  enabled: boolean;
  /** Minify text bodies (strip whitespace + comments) before sending */
  minify: boolean;
  /** Validate that html/css/js bodies parse; log + skip minify on failure */
  validate: boolean;
  /** Compress bodies with Content-Encoding based on Accept-Encoding */
  compress: boolean;
  /** Preferred algorithm; "auto" picks br when the client advertises it, else gzip */
  compressAlgorithm: "br" | "gzip" | "auto";
  /** Minimum body size (bytes) before compression kicks in */
  compressThreshold: number;
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
  /** Default sampler name (euler, euler_a, dpmpp_2m, etc.) */
  sampler: string;
  /** Default scheduler (discrete, karras, etc.) */
  scheduler?: string;
  /** Default negative prompt */
  negativePrompt?: string;
  /** LoRA model directory for relative path resolution */
  loraModelDir?: string;
  /** Default LoRA entries (path relative to loraModelDir) */
  loras?: { path: string; multiplier: number; isHighNoise?: boolean }[];
}

interface ImageProviderConfig {
  /** Unique provider name */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** Base URL */
  baseUrl: string;
  /** API family: openai-compatible, SD WebUI, or SD cpp native */
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
  /** AWS Bedrock provider (Claude, Llama, Titan models) */
  bedrock?: BedrockProviderConfig;
}

interface BedrockProviderConfig {
  /** Unique provider instance name */
  name: string;
  /** Human-readable label for UI */
  label: string;
  /** AWS region (e.g., us-east-1) */
  region: string;
  /** AWS access key ID (optional - uses env vars if not set) */
  accessKeyId?: string;
  /** AWS secret access key (optional - uses env vars if not set) */
  secretAccessKey?: string;
  /** Default model ID/alias */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Whether user API keys can override */
  allowUserApiKey: boolean;
  /** Known models (name → limits) */
  models: Record<string, ModelLimits>;
}

// ── Auto-Start (spawn external servers at startup) ──────────

interface LlamaCppAutoStartConfig {
  /** Master toggle — false = external server expected */
  enabled: boolean;
  /** Path to GGUF model OR HuggingFace identifier (org/repo:quant) */
  modelPath: string;
  /** Port for llama-server (default: 9011) */
  port: number;

  // ── Model / hardware ───────────────────────────────────
  /** Model alias for API reference. Defaults to model filename. */
  alias?: string;
  /** Context size in tokens (default: 8192) */
  ctxSize?: number;
  /** Number of CPU threads (default: -1 = auto) */
  threads?: number;
  /** Max GPU layers to offload (number, "auto", or "all") */
  nGpuLayers?: string;
  /** Comma-separated GPU device list. Use --list-devices to see options. */
  device?: string;
  /** Force system to keep model in RAM */
  mlock?: boolean;

  // ── KV cache ───────────────────────────────────────────
  /** KV cache data type for K: f32, f16, bf16, q8_0, q4_0, iq4_nl, q5_0, q5_1 */
  cacheTypeK?: string;
  /** KV cache data type for V */
  cacheTypeV?: string;
  /** KV cache data type for K (draft): f32, f16, bf16, q8_0, q4_0, iq4_nl, q5_0, q5_1 */
  cacheTypeKD?: string;
  /** KV cache data type for V */
  cacheTypeVD?: string;
  /** KV cache RAM budget in MiB */
  cacheRam?: number;
  /** Flash attention: on, off, or auto (default: auto) */
  flashAttn?: string;
  /** Use full-size SWA cache */
  swaFull?: boolean;

  // ── Context scaling ────────────────────────────────────
  /** RoPE frequency scaling: none, linear, yarn */
  ropeScaling?: string;
  /** RoPE context scaling factor */
  ropeScale?: number;

  // ── Sampler defaults (passed at server start) ──────────
  /** Temperature (default: 1.0) */
  temp?: number;
  /** Top-K sampling (default: 40) */
  topK?: number;
  /** Top-P sampling (default: 0.95) */
  topP?: number;
  /** Min-P sampling (default: 0.01) */
  minP?: number;
  /** Repeat penalty (default: 1.05) */
  repeatPenalty?: number;

  // ── Server behavior ────────────────────────────────────
  /** Max parallel requests (default: 1) */
  parallelRequests?: number;
  /** Flash inference tuning (on = enable) */
  fit?: boolean;

  // ── Advanced ───────────────────────────────────────────
  /** Speculative decoding type: draft-eagle3, ngram-map-k4v, etc. */
  specType?: string;
  /** Min draft tokens for speculative decoding */
  specDraftNMin?: number;
  /** Max draft tokens for speculative decoding */
  specDraftNMax?: number;
  /** Reasoning/thinking budget in tokens (-1 = unlimited) */
  reasoningBudget?: number;
  /** Enable Jinja template processing (default: enabled) */
  jinja?: boolean;

  /** Extra CLI args passed to llama-server */
  extraArgs?: string[];
}

interface SdCppAutoStartConfig {
  /** Master toggle — false = external server expected */
  enabled: boolean;
  /** "checkpoint" = standalone full model (-m), "diffusion" = component model (--diffusion-model, needs llm+vae) */
  modelType: "checkpoint" | "diffusion";
  /** Path to .safetensors model */
  modelPath: string;
  /** Port for sd-server (default: 9010) */
  port: number;

  // ── Text encoders (pick one or none) ────────────────────
  /** Path to LLM text encoder GGUF (Qwen, Mistral, etc.). Needed for most diffusion models. */
  llmPath?: string;
  /** Path to CLIP-L text encoder (SD1.x/SD2.x) */
  clipLPath?: string;
  /** Path to CLIP-G text encoder */
  clipGPath?: string;
  /** Path to T5-XXL text encoder */
  t5xxlPath?: string;

  // ── Model components ────────────────────────────────────
  /** Path to VAE safetensors. Optional — omit to use baked-in VAE. */
  vaePath?: string;
  /** VAE latent format override: auto, flux, sd3, or flux2 */
  vaeFormat?: string;
  /** Path to control net model */
  controlNetPath?: string;
  /** LoRA directory path */
  loraDir?: string;
  /** Path to TAESD for fast low-quality decoding */
  taesdPath?: string;
  /** Highres fix upscaler model directory */
  hiresUpscalersDir?: string;
  /** Embeddings directory */
  embdDir?: string;
  /** Path to PhotoMaker model */
  photoMakerPath?: string;
  /** Path to ESRGAN upscale model */
  upscaleModelPath?: string;

  // ── Performance / memory (boolean flags) ────────────────
  /** Flash attention (global). Default false. */
  fa?: boolean;
  /** Flash attention in diffusion model only */
  diffusionFA?: boolean;
  /** Process VAE in tiles to reduce memory */
  vaeTiling?: boolean;
  /** Load all params at model-load time instead of lazy */
  eagerLoad?: boolean;
  /** Place weights in RAM, load to VRAM on demand */
  offloadToCPU?: boolean;
  /** Enable residency+prefetch streaming (needs maxVram) */
  streamLayers?: boolean;
  /** Auto-pick diffusion/te/vae device placements from model size + VRAM budget */
  autoFit?: boolean;

  // ── Performance / memory (value flags) ──────────────────
  /** Max VRAM budget in GiB (graph-cut segmented execution) */
  maxVram?: string;
  /** Runtime backend assignment, e.g. "cpu" or "clip=cpu,vae=cuda0,diffusion=vulkan0" */
  backend?: string;
  /** RNG backend: std_default, cuda, or cpu */
  rng?: string;
  /** Sampler RNG. Defaults to --rng if not set. */
  samplerRng?: string;
  /** Weight type: f32, f16, q4_0, q4_1, q5_0, q5_1, q8_0, q2_K, q3_K, q4_K */
  type?: string;
  /** Prediction type override: eps, v, edm_v, sd3_flow, flux_flow, sefi_flow */
  prediction?: string;
  /** Cache method: easycache, ucache, dbcache, taylorseer, cache-dit, spectrum */
  cacheMode?: string;
  /** Cache params (key=value, comma-separated) */
  cacheOption?: string;

  /** Extra CLI args passed to sd-server */
  extraArgs?: string[];
}

interface LlamaSwapAutoStartConfig {
  /** Enable auto-start of llama-swap proxy */
  enabled: boolean;
  /** Path to llama-swap config YAML */
  configPath: string;
}

interface AutoStartConfig {
  /** Spawn llama.cpp server as child process at startup */
  llamaCpp?: LlamaCppAutoStartConfig;
  /** Spawn llama-swap proxy as child process at startup */
  llamaSwap?: LlamaSwapAutoStartConfig;
  /** Spawn sd-server as child process at startup */
  sdCpp?: SdCppAutoStartConfig;
}

interface ModelRoleAssignment {
  /** Provider name (must match a registered provider) */
  provider: string;
  /** Model ID within the provider */
  model: string;
}

interface GenerationConfig {
  /** Provider configurations */
  providers: GenerationProvidersConfig;
  /** Default provider name when none specified per-chat */
  defaultProvider: string;
  /** Default model per provider (providerName → modelId) */
  defaultModels: Record<string, string>;
  /** Auto-spawn external AI servers at startup (llama.cpp, sd.cpp) */
  autoStart?: AutoStartConfig;
  /** Default model role assignments (config-level, overridden by DB) */
  modelRoles?: {
    /** Primary reasoning model */
    main?: ModelRoleAssignment;
    /** Vision/LM model for captioning */
    captioning?: ModelRoleAssignment;
    /** Content moderation/censoring model */
    moderation?: ModelRoleAssignment;
  };
}

// ── BYO API Key ────────────────────────────────────────────

interface ByoKeyConfig {
  /** Master toggle for user-owned API keys */
  enabled: boolean;
  /** Encryption key for stored API keys (falls back to auth.sessionSecret) */
  encryptionKey?: string;
}

// ── Encryption / SMK ────────────────────────────────────────

interface EncryptionConfig {
  /** 256-bit hex key from SERVER_ENCRYPTION_KEY env var. Missing = encryption disabled (dev mode). */
  serverEncryptionKey?: string;
  /** true = refuse to start without SMK (prod guard). Default false. */
  required: boolean;
  /** Min bytes before compressing prior to encrypt. Default 128. */
  compressThreshold: number;
  /** Preferred compression algorithm. Default gzip. */
  compressAlgorithm: "gzip" | "brotli" | "zstd";
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

// ── Testing (e2e external-server config) ────────────────────

interface TestingConfig {
  /** Path to GGUF model for llama.cpp external-server e2e */
  llamaModel?: string;
  /** Path to safetensors model for sd-server external-server e2e */
  sdModel?: string;
  /** llama.cpp port for external-server e2e (default: 9011) */
  llamaPort?: number;
  /** sd-server port for external-server e2e (default: 9010) */
  sdPort?: number;
  /** llama-swap config yaml path for external-server e2e */
  llamaSwapConfig?: string;
}

// ── Response Headers (FExBE: browser feature / security / perf / observability) ──

/**
 * Content-Security-Policy directive set.
 * Applied only to HTML views. `script-src` uses `'unsafe-inline'` because 7 inline
 * `oninput`/`onchange` handlers remain (characters, worlds, gallery). Migrate to
 * Alpine `x-on:` before tightening.
 */
interface CspConfig {
  /** Master toggle for CSP emission. */
  enabled: boolean;
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  fontSrc: string[];
  connectSrc: string[];
  objectSrc: string[];
  baseUri: string[];
  frameAncestors: string[];
  formAction: string[];
  /** Emit `upgrade-insecure-requests` (HTTPS deployments). */
  upgradeInsecureRequests: boolean;
  /** Emit as `Content-Security-Policy-Report-Only` (observe violations, don't enforce). */
  reportOnly: boolean;
}

/**
 * Response-header policy. Centralized, route-aware header injection engine.
 * Per-route behavior is classified at apply time (html / api / static / docs).
 */
interface HeadersConfig {
  /** Master toggle. When false, no headers are added. */
  enabled: boolean;
  /** `Referrer-Policy` value. */
  referrerPolicy: string;
  /** Emit `X-Content-Type-Options: nosniff`. */
  xContentTypeOptions: boolean;
  /** `X-Frame-Options`: "DENY" | "SAMEORIGIN" | null (omit). */
  xFrameOptions: "DENY" | "SAMEORIGIN" | null;
  /** `Permissions-Policy` value (feature delegation). */
  permissionsPolicy: string;
  /** CSP directive set (HTML only). */
  csp: CspConfig;
  /** `Cross-Origin-Opener-Policy`. null = omit. */
  crossOriginOpenerPolicy: "same-origin" | "same-origin-allow-popups" | null;
  /** `Cross-Origin-Embedder-Policy`. null = omit. */
  crossOriginEmbedderPolicy: "require-corp" | null;
  /** `Cross-Origin-Resource-Policy` for static subresources. */
  crossOriginResourcePolicy: "same-origin" | "cross-origin" | null;
  /** `Timing-Allow-Origin` for resource timing (performance measurement). */
  timingAllowOrigin: string;
  /** Append `immutable` to `Cache-Control` for content-hashed assets. */
  immutableHashedAssets: boolean;
  /** `Link: <...>; rel=preload` hints emitted on HTML documents. */
  linkPreload: string[];
  /** `Accept-CH` / `Critical-CH` client hint tokens emitted on HTML. */
  acceptClientHints: string[];
  /** Advertise Save-Data cooperativeness (informational). */
  saveData: boolean;
  /** Early Hints (103) — requires transport support. */
  earlyHints: { enabled: boolean };
  /** `Reporting-Endpoints` map (name → URL) for frontend telemetry. */
  reportingEndpoints: Record<string, string>;
  /** `NEL` policy JSON string (null = omit). */
  nel: string | null;
}

// ── Centralized data directory ──────────────────────────────
// See src/config/constants.ts for DATA_DIR — single source of truth.

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
  encryption: EncryptionConfig;
  headers: HeadersConfig;
  dynamicResponse: DynamicResponseConfig;
  testing?: TestingConfig;
}

// DEAD CODE: Bedrock provider defaults (add when implementing)
// const BEDROCK_DEFAULTS: BedrockProviderConfig = {
//   name: "bedrock",
//   label: "AWS Bedrock",
//   region: "us-east-1",
//   timeout: 30000,
//   retries: 3,
//   allowUserApiKey: true,
//   models: {},
// };

export type {
  AgeGateConfig,
  AssetsConfig,
  AssistantConfig,
  AuthConfig,
  AutoStartConfig,
  BedrockProviderConfig,
  ByoKeyConfig,
  Config,
  CspConfig,
  DatabaseConfig as DbConfig,
  DocumentationConfig,
  DynamicResponseConfig,
  EncryptionConfig,
  GenerationConfig,
  GenerationProvidersConfig,
  HeadersConfig,
  ImageProviderConfig,
  ImageProviderDefaults,
  LlamaCppAutoStartConfig,
  LlamaSwapAutoStartConfig,
  LoggingConfig,
  MessagesConfig,
  ModelLimits,
  ModelRoleAssignment,
  NsfwConfig,
  ProviderInstanceConfig,
  SdCppAutoStartConfig,
  ServerConfig,
  TestingConfig,
  TlsConfig,
  TransportCompressionConfig,
  TransportConfig,
  TransportLimitsConfig,
  TuiConfig,
};
