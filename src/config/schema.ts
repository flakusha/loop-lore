// src/config/schema.ts — Config interface + defaults

interface ServerConfig {
  port: number;
  host: string;
}

interface DbConfig {
  type: "sqlite" | "postgres";
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
  level: "debug" | "info" | "warn" | "error";
}

interface TuiConfig {
  enabled: boolean;
}

interface DocsConfig {
  enabled: boolean;
}

/**
 * Age gate / verification config.
 * When enabled, users must declare their age before using the app.
 * Set enabled=false to skip gating entirely ("internet should be free").
 */
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
  mode: "none" | "self-declaration" | "verification";
}

interface Config {
  server: ServerConfig;
  db: DbConfig;
  assets: AssetsConfig;
  assistant: AssistantConfig;
  logging: LoggingConfig;
  tui: TuiConfig;
  docs: DocsConfig;
  ageGate: AgeGateConfig;
}

const DEFAULTS: Config = {
  server: {
    port: 3000,
    host: "localhost",
  },
  db: {
    type: "sqlite",
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
    level: "debug",
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
    mode: "self-declaration",
  },
};

export type {
  Config,
  ServerConfig,
  DbConfig,
  AssetsConfig,
  AssistantConfig,
  LoggingConfig,
  TuiConfig,
  DocsConfig,
  AgeGateConfig,
};
export { DEFAULTS };
