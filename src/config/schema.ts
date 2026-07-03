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
};
export { DEFAULTS };
