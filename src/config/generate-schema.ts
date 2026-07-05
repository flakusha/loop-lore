// src/config/generate-schema.ts — Generate JSON Schema from config types
//
// Usage: bun run src/config/generate-schema.ts
// Outputs: schemas/loop-lore-config.schema.json

import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** JSON Schema definition for loop-lore config */
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "./schemas/loop-lore-config.schema.json",
  title: "loop-lore Configuration",
  description: "Configuration schema for loop-lore application",
  type: "object",
  properties: {
    server: {
      type: "object",
      description: "Server configuration",
      properties: {
        port: {
          type: "integer",
          minimum: 1,
          maximum: 65535,
          default: 3000,
          description: "Server port",
        },
        host: {
          type: "string",
          default: "localhost",
          description: "Server host",
        },
        tls: {
          type: "object",
          description: "TLS certificate configuration",
          properties: {
            key: {
              type: "string",
              default: "./data/certs/key.pem",
              description: "Path to TLS private key (PEM)",
            },
            cert: {
              type: "string",
              default: "./data/certs/cert.pem",
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
          default: "./data/loop-lore.db",
          description: "SQLite database file path",
        },
        url: {
          type: "string",
          description: "PostgreSQL connection URL (required when db.type is 'postgres')",
        },
      },
      required: ["type", "sqliteFilename"],
    },
    assets: {
      type: "object",
      description: "Asset storage configuration",
      properties: {
        enabled: {
          type: "boolean",
          default: true,
          description: "Enable asset uploads",
        },
        uploadDir: {
          type: "string",
          default: "./data/uploads",
          description: "Directory for uploaded assets",
        },
        maxFileSize: {
          type: "integer",
          minimum: 0,
          default: 10485760,
          description: "Maximum file size in bytes",
        },
        compression: {
          type: "boolean",
          default: true,
          description: "Enable asset compression",
        },
      },
      required: ["enabled", "uploadDir", "maxFileSize", "compression"],
    },
    assistant: {
      type: "object",
      description: "AI assistant configuration",
      properties: {
        enabled: {
          type: "boolean",
          default: true,
          description: "Enable the AI assistant",
        },
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
        jsonlPath: {
          type: "string",
          description: "Path for JSONL log output",
        },
        jsonlMaxBytes: {
          type: "integer",
          default: 104857600,
          description: "Max bytes before log rotation",
        },
        jsonlMaxFiles: {
          type: "integer",
          default: 5,
          description: "Max rotated files to keep",
        },
      },
      required: ["level"],
    },
    tui: {
      type: "object",
      description: "TUI configuration",
      properties: {
        enabled: {
          type: "boolean",
          default: true,
          description: "Enable TUI mode",
        },
      },
      required: ["enabled"],
    },
    docs: {
      type: "object",
      description: "Documentation server configuration",
      properties: {
        enabled: {
          type: "boolean",
          default: true,
          description: "Enable documentation server",
        },
        public: {
          type: "array",
          items: { type: "string" },
          description: "Allowlist of visible doc path prefixes for non-admin users",
        },
      },
      required: ["enabled"],
    },
    ageGate: {
      type: "object",
      description: "Age verification configuration",
      properties: {
        enabled: {
          type: "boolean",
          default: false,
          description: "Enable age gate",
        },
        minimumAge: {
          type: "integer",
          minimum: 0,
          default: 18,
          description: "Minimum required age",
        },
        mode: {
          type: "string",
          enum: ["none", "self-declaration", "verification"],
          default: "self-declaration",
          description: "Age verification mode",
        },
      },
      required: ["enabled", "minimumAge", "mode"],
    },
    auth: {
      type: "object",
      description: "Authentication configuration",
      properties: {
        required: {
          type: "boolean",
          default: false,
          description: "Require remote authentication",
        },
        registrationOpen: {
          type: "boolean",
          default: true,
          description: "Allow new user registration",
        },
        sessionTimeoutHours: {
          type: "integer",
          minimum: 0,
          default: 24,
          description: "Session timeout in hours",
        },
        maxSessionsPerUser: {
          type: "integer",
          minimum: 1,
          default: 10,
          description: "Max simultaneous sessions per user",
        },
        demoUsername: {
          type: "string",
          default: "demo",
          description: "Username for demo mode",
        },
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
      description: "Transport layer configuration",
      properties: {
        defaultProtocol: {
          type: "string",
          enum: ["http/1.1", "http/2", "http/3", "websocket", "webtransport", "tcp", "tls"],
          default: "http/1.1",
          description: "Default transport protocol",
        },
        enableWebSocket: {
          type: "boolean",
          default: true,
          description: "Enable WebSocket support",
        },
        enableWebTransport: {
          type: "boolean",
          default: false,
          description: "Enable WebTransport support",
        },
        enableH2: {
          type: "boolean",
          default: false,
          description: "Enable HTTP/2 support",
        },
        enableH3: {
          type: "boolean",
          default: false,
          description: "Enable HTTP/3 support",
        },
        compression: {
          type: "object",
          properties: {
            enabled: {
              type: "boolean",
              default: false,
            },
            default: {
              type: "string",
              enum: ["zstd", "br", "gzip", "none"],
              default: "none",
            },
            threshold: {
              type: "integer",
              minimum: 0,
              default: 256,
            },
          },
          required: ["enabled", "default", "threshold"],
        },
        limits: {
          type: "object",
          properties: {
            maxFrameSize: {
              type: "integer",
              minimum: 0,
              default: 65536,
            },
            maxPayload: {
              type: "integer",
              minimum: 0,
              default: 327680,
            },
            maxConcurrentStreams: {
              type: "integer",
              minimum: 1,
              default: 100,
            },
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
      description: "Message handling configuration",
      properties: {
        autoHideInvalid: {
          type: "boolean",
          default: false,
        },
        hideConfirmation: {
          type: "boolean",
          default: true,
        },
        maxLength: {
          type: "integer",
          minimum: 0,
          default: 100000,
        },
        maxGenerationRetries: {
          type: "integer",
          minimum: 0,
          default: 3,
        },
        generationTimeoutMs: {
          type: "integer",
          minimum: 0,
          default: 30000,
        },
        idempotencyExpiryHours: {
          type: "integer",
          minimum: 0,
          default: 24,
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
      description: "NSFW content configuration",
      properties: {
        allowNsfw: {
          type: "boolean",
          default: true,
          description: "Allow NSFW content",
        },
        nsfwMinAge: {
          type: "integer",
          minimum: 0,
          default: 18,
          description: "Minimum age for NSFW content",
        },
      },
      required: ["allowNsfw", "nsfwMinAge"],
    },
    generation: {
      type: "object",
      description: "LLM generation configuration",
      properties: {
        providers: {
          type: "object",
          properties: {
            openaiCompatible: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  label: { type: "string" },
                  baseUrl: { type: "string", format: "uri" },
                  apiKey: { type: "string" },
                  model: { type: "string" },
                  timeout: { type: "integer", minimum: 0 },
                  retries: { type: "integer", minimum: 0 },
                  allowUserApiKey: { type: "boolean" },
                  models: {
                    type: "object",
                    additionalProperties: {
                      type: "object",
                      properties: {
                        contextLimit: { type: "integer", minimum: 1 },
                        maxOutput: { type: "integer", minimum: 1 },
                      },
                      required: ["contextLimit", "maxOutput"],
                    },
                  },
                },
                required: ["name", "label", "baseUrl", "model", "timeout", "retries", "allowUserApiKey", "models"],
              },
            },
            anthropic: {
              type: "object",
              properties: {
                name: { type: "string" },
                label: { type: "string" },
                baseUrl: { type: "string", format: "uri" },
                apiKey: { type: "string" },
                timeout: { type: "integer", minimum: 0 },
                retries: { type: "integer", minimum: 0 },
                models: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      contextLimit: { type: "integer", minimum: 1 },
                      maxOutput: { type: "integer", minimum: 1 },
                    },
                    required: ["contextLimit", "maxOutput"],
                  },
                },
              },
              required: ["name", "label", "baseUrl", "apiKey", "timeout", "retries", "models"],
            },
            ollamaNative: {
              type: "object",
              properties: {
                name: { type: "string" },
                label: { type: "string" },
                baseUrl: { type: "string", format: "uri" },
                apiKey: { type: "string" },
                model: { type: "string" },
                timeout: { type: "integer", minimum: 0 },
                retries: { type: "integer", minimum: 0 },
                models: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    properties: {
                      contextLimit: { type: "integer", minimum: 1 },
                      maxOutput: { type: "integer", minimum: 1 },
                    },
                    required: ["contextLimit", "maxOutput"],
                  },
                },
              },
              required: ["name", "label", "baseUrl", "model", "timeout", "retries", "models"],
            },
            sd: {
              type: "object",
              properties: {
                name: { type: "string" },
                label: { type: "string" },
                baseUrl: { type: "string", format: "uri" },
                apiKey: { type: "string" },
                apiFamily: { type: "string", enum: ["openai", "sdapi", "sdcpp"] },
                defaults: {
                  type: "object",
                  properties: {
                    width: { type: "integer", minimum: 1 },
                    height: { type: "integer", minimum: 1 },
                    steps: { type: "integer", minimum: 1 },
                    cfgScale: { type: "number", minimum: 0 },
                    sampler: { type: "string" },
                  },
                  required: ["width", "height", "steps", "cfgScale", "sampler"],
                },
                timeout: { type: "integer", minimum: 0 },
                generationTimeout: { type: "integer", minimum: 0 },
              },
              required: ["name", "label", "baseUrl", "apiFamily", "defaults", "timeout", "generationTimeout"],
            },
          },
        },
        defaultProvider: {
          type: "string",
          default: "",
        },
        defaultModels: {
          type: "object",
          additionalProperties: { type: "string" },
          default: {},
        },
      },
      required: ["providers", "defaultProvider", "defaultModels"],
    },
    byoKey: {
      type: "object",
      description: "Bring-your-own API key configuration",
      properties: {
        enabled: {
          type: "boolean",
          default: true,
          description: "Enable BYO API keys",
        },
        encryptionKey: {
          type: "string",
          description: "Encryption key for stored API keys",
        },
      },
      required: ["enabled"],
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
    "ageGate",
    "auth",
    "transport",
    "messages",
    "nsfw",
    "generation",
    "byoKey",
  ],
};

function main() {
  const outputPath = `${__dirname}/../../schemas/loop-lore-config.schema.json`;
  writeFileSync(outputPath, JSON.stringify(schema, null, 2));
  console.log(`Generated schema: ${outputPath}`);
}

main();