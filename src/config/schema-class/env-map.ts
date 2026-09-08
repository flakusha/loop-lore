// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/env-map.ts — flat ENV_VAR → dot.path mapping generation
import { AGE_GATE_DEFAULTS, } from "./age-gate";
import { ASSETS_DEFAULTS, } from "./assets";
import { ASSISTANT_DEFAULTS, } from "./assistant";
import { AUTH_DEFAULTS, } from "./auth";
import { BYO_KEY_DEFAULTS, } from "./byo-key";
import { CRON_DEFAULTS, } from "./cron";
import { DB_DEFAULTS, } from "./db";
import { DOCS_DEFAULTS, } from "./docs";
import { DYNAMIC_RESPONSE_DEFAULTS, } from "./dynamic-response";
import { ENCRYPTION_DEFAULTS, } from "./encryption";
import { FRONTEND_DEFAULTS, } from "./frontend";
import { FEDERATION_DEFAULTS, } from "./federation";
import { GENERATION_DEFAULTS, } from "./generation";
import { HEADERS_SECTION_DEFAULTS, } from "./headers";
import { HOOKS_DEFAULTS, } from "./hooks";
import { IDEMPOTENCY_DEFAULTS, } from "./idempotency";
import { LOGGING_DEFAULTS, } from "./logging";
import { MESSAGES_DEFAULTS, } from "./messages";
import { NSFW_DEFAULTS, } from "./nsfw";
import { OBSERVABILITY_DEFAULTS, } from "./observability";
import { SERVER_DEFAULTS, } from "./server";
import { TRANSPORT_DEFAULTS, } from "./transport";
import { TUI_DEFAULTS, } from "./tui";

type EnvMap = Record<string, string>;

/** Build flat ENV_VAR → dot.path mapping from all section fields */
export const envMap = (): EnvMap => {
  const map: EnvMap = {};
  const s = {
    server: SERVER_DEFAULTS,
    db: DB_DEFAULTS,
    assets: ASSETS_DEFAULTS,
    assistant: ASSISTANT_DEFAULTS,
    logging: LOGGING_DEFAULTS,
    tui: TUI_DEFAULTS,
    docs: DOCS_DEFAULTS,
    ageGate: AGE_GATE_DEFAULTS,
    auth: AUTH_DEFAULTS,
    transport: TRANSPORT_DEFAULTS,
    messages: MESSAGES_DEFAULTS,
    nsfw: NSFW_DEFAULTS,
    observability: OBSERVABILITY_DEFAULTS,
    hooks: HOOKS_DEFAULTS,
    idempotency: IDEMPOTENCY_DEFAULTS,
    generation: GENERATION_DEFAULTS,
    byoKey: BYO_KEY_DEFAULTS,
    encryption: ENCRYPTION_DEFAULTS,
    headers: HEADERS_SECTION_DEFAULTS,
    dynamicResponse: DYNAMIC_RESPONSE_DEFAULTS,
    frontend: FRONTEND_DEFAULTS,
    cron: CRON_DEFAULTS,
    federation: FEDERATION_DEFAULTS,
  };

  const add = (prefix: string, obj: Record<string, unknown>,) => {
    for (const [key, val,] of Object.entries(obj,)) {
      const path = `${prefix}.${key}`;
      const envKey = path.replaceAll(".", "_",).toUpperCase();
      if (val && typeof val === "object" && !Array.isArray(val,)) {
        add(path, val as Record<string, unknown>,);
      } else {
        map[envKey] = path;
      }
    }
  };

  add("server", s.server,);
  add("db", s.db,);
  add("assets", s.assets,);
  add("assistant", s.assistant,);
  add("logging", s.logging,);
  add("tui", s.tui,);
  add("docs", s.docs,);
  add("ageGate", s.ageGate,);
  add("auth", s.auth,);
  add("transport", s.transport,);
  add("messages", s.messages,);
  add("nsfw", s.nsfw,);
  add("observability", s.observability,);
  add("hooks", s.hooks,);
  add("idempotency", s.idempotency,);
  add("generation", s.generation,);
  add("byoKey", s.byoKey,);
  add("encryption", s.encryption,);
  add("headers", s.headers,);
  add("dynamicResponse", s.dynamicResponse,);
  add("frontend", s.frontend,);
  add("cron", s.cron);
  add("federation", s.federation);

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
  map.ASSETS_SIGNED_URL_SECRET = "assets.signedUrlSecret";
  map.ASSETS_SIGNED_URL_EXPIRY_SECONDS = "assets.signedUrlExpirySeconds";
  map.ENABLE_ASSISTANT = "assistant.enabled";
  map.LOG_LEVEL = "logging.level";
  map.ENABLE_TUI = "tui.enabled";
  map.ENABLE_DOCS = "docs.enabled";
  map.AGE_GATE_ENABLED = "ageGate.enabled";
  map.AGE_GATE_MINIMUM_AGE = "ageGate.minimumAge";
  map.AGE_GATE_MODE = "ageGate.mode";
  map.TLS_CERT = "server.tls.cert";
  map.TLS_KEY = "server.tls.key";
  map.SERVER_TRUST_PROXY = "server.trustProxy";
  map.AUTH_REQUIRED = "auth.required";
  map.AUTH_REGISTRATION_OPEN = "auth.registrationOpen";
  map.SESSION_TIMEOUT_HOURS = "auth.sessionTimeoutHours";
  map.SESSION_MAX_PER_USER = "auth.maxSessionsPerUser";
  map.DEMO_USERNAME = "auth.demoUsername";
  map.DEMO_AUTO_SETUP = "auth.demoAutoSetup";
  map.AUTH_ADMIN_USERNAME = "auth.adminUsername";

  map.AUTH_ADMIN_PASSWORD = "auth.adminPassword";
  map.AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK = "auth.legacyOpaqueTokenFallback";
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
  map.NSFW_DEFAULT_SCOPE = "nsfw.defaultNsfwScope";
  map.NSFW_CONSENT_REQUIRED = "nsfw.consentRequired";
  map.NSFW_AUDIT_LOGGING = "nsfw.auditLogging";
  map.NSFW_USE_LLM_CLASSIFIER = "nsfw.useLlmClassifier";
  map.ENABLE_MOOD_HOOKS = "hooks.enableMoodHooks";
  map.ENABLE_EMOTION_HOOKS = "hooks.enableEmotionHooks";
  map.ENABLE_NSFW_HOOKS = "hooks.enableNsfwHooks";
  map.ENABLE_MODERATION_HOOKS = "hooks.enableModerationHooks";
  map.LLM_DEFAULT_PROVIDER = "generation.defaultProvider";
  map.BYO_KEY_ENABLED = "byoKey.enabled";
  map.BYO_KEY_ENCRYPTION_KEY = "byoKey.encryptionKey";
  map.SERVER_ENCRYPTION_KEY = "encryption.serverEncryptionKey";
  map.ENCRYPTION_REQUIRED = "encryption.required";
  map.COMPRESS_THRESHOLD = "encryption.compressThreshold";
  map.COMPRESS_ALGORITHM = "encryption.compressAlgorithm";
  map.KEY_ROTATION_DAYS = "encryption.keyRotationDays";
  map.TESTING_LLAMA_MODEL = "testing.llamaModel";
  map.TESTING_SD_MODEL = "testing.sdModel";
  map.TESTING_LLAMA_PORT = "testing.llamaPort";
  map.TESTING_SD_PORT = "testing.sdPort";
  map.CRON_ENABLED = "cron.enabled";

  return map;
};
