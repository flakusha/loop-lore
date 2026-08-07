// src/config/schema-class/validate.ts — config validation
import type { Config, } from "../schema";

export const validate = (config: Config,): void => {
  if (!["sqlite", "postgres",].includes(config.db.type,)) {
    throw new Error(`Invalid db.type: "${config.db.type}"`,);
  }
  if (config.db.type === "postgres" && !config.db.url) {
    throw new Error("db.url is required when db.type is 'postgres'",);
  }
  if (config.server.port < 0 || config.server.port > 65_535) {
    throw new Error(`Invalid server.port: ${config.server.port}. Must be 0-65535`,);
  }
  if (!["trace", "debug", "info", "warn", "error", "fatal",].includes(config.logging.level,)) {
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
};
