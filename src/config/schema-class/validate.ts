// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/validate.ts — config validation
import type { Config, } from "../schema";
import { validateAcpProfiles, } from "../sections/harness";

/**
 * @param config - Fully merged config to check, after defaults are applied.
 * @throws {Error} If any config value fails schema validation.
 */
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

  if (config.generation.providers.ollamaNative && !config.generation.providers.ollamaNative.baseUrl) {
    throw new Error("generation.providers.ollamaNative requires baseUrl",);
  }

  if (config.generation.providers.ollamaNative && !config.generation.providers.ollamaNative.model) {
    throw new Error("generation.providers.ollamaNative requires model",);
  }

  if (config.generation.providers.deepl && !config.generation.providers.deepl.authKey) {
    throw new Error("generation.providers.deepl requires authKey",);
  }

  if (config.generation.providers.deepl && !config.generation.providers.deepl.model) {
    throw new Error("generation.providers.deepl requires model (default target language)",);
  }

  if (
    config.generation.providers.libretranslate &&
    !config.generation.providers.libretranslate.baseUrl
  ) {
    throw new Error("generation.providers.libretranslate requires baseUrl",);
  }

  if (
    config.generation.providers.libretranslate &&
    !config.generation.providers.libretranslate.model
  ) {
    throw new Error("generation.providers.libretranslate requires model (default target language)",);
  }

  if (
    config.generation.providers.googleTranslate &&
    !config.generation.providers.googleTranslate.apiKey
  ) {
    throw new Error("generation.providers.googleTranslate requires apiKey",);
  }

  if (
    config.generation.providers.googleTranslate &&
    !config.generation.providers.googleTranslate.model
  ) {
    throw new Error("generation.providers.googleTranslate requires model (default target language)",);
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
    !["require-corp", "credentialless",].includes(config.headers.crossOriginEmbedderPolicy,)
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

  if (typeof config.web.editor !== "string" || config.web.editor.trim() === "") {
    throw new Error(`Invalid web.editor: "${config.web.editor}"`,);
  }

  // External harness profiles: duplicate names, unknown tier keys, and
  // non-`provider/id` models are config rot — reject at load, not at dispatch.
  validateAcpProfiles(config.harness.acp,);
};
