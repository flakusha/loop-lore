// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/validate.ts — config validation
import { AUTOROUTE_SCENARIOS, type Config, } from "../schema";
import { FEATURE_PROFILES, } from "../schema/features";
import { COMFYUI_MODEL_EXTENSIONS, isComfyUIModelName, } from "../schema/providers";
import { validateAcpProfiles, } from "../sections/harness";
import { validateMcpConfig, } from "../sections/mcp";
import { PROMPT_BUDGET_BOUNDS, } from "../sections/prompt";

/**
 * @param config - Merged config to check.
 * @throws {Error} If an enabled BYOK store has a too-short master secret.
 */
function validateByoKey(config: Config,): void {
  const secret = config.byoKey?.encryptionKey;
  if (config.byoKey?.enabled && secret && secret.length < 32) {
    throw new Error("byoKey.encryptionKey must be at least 32 characters when BYOK is enabled",);
  }
}

/**
 * @param config - Fully merged config to check, after defaults are applied.
 * @throws {Error} If a pinned ComfyUI model name is incompatible with its slot.
 */
function validateComfyUIModels(config: Config,): void {
  const providers = [
    ...(config.generation.providers.video ?? []).map((provider,) => ({ provider, kind: "video", })),
    ...(config.generation.providers.sd ?? []).map((provider,) => ({ provider, kind: "image", })),
  ];
  for (const { provider, kind, } of providers) {
    const models = provider.models;
    if (!models) { continue; }
    if (models.noVae && models.vae) {
      throw new Error(`${kind} provider ${provider.name} sets models.noVae and models.vae — pick one`,);
    }

    for (const role of Object.keys(COMFYUI_MODEL_EXTENSIONS,) as (keyof typeof COMFYUI_MODEL_EXTENSIONS)[]) {
      const name = models[role];
      if (name !== undefined && !isComfyUIModelName(role, name,)) {
        throw new Error(
          `Invalid ComfyUI ${role} model "${name}" on ${kind} provider ${provider.name}`,
        );
      }
    }
  }
}

/**
 * Feature profiles gate surfaces; an explicit unknown value is boot-rot.
 * @param config - Merged config to check.
 * @throws {Error} If features.profile is explicitly unknown.
 */
function validateFeatureProfile(config: Config,): void {
  const profile = config.features?.profile;
  if (profile !== undefined && !(FEATURE_PROFILES as readonly string[]).includes(profile,)) {
    throw new Error(
      `Invalid features.profile: "${profile}". Must be one of: ${FEATURE_PROFILES.join(", ",)}`,
    );
  }
}

/**
 * @param config - Fully merged config to check, after defaults are applied.
 * @throws {Error} If any config value fails schema validation.
 */
export const validate = (config: Config,): void => {
  if (!["sqlite", "postgres",].includes(config.db.type,)) {
    throw new Error(`Invalid db.type: "${config.db.type}"`,);
  }

  // `db.type=postgres` is accepted here: the runtime is always SQLite and
  // warns loudly about the ignored setting (see load/db-warnings.ts). A missing
  // `db.url` must not abort the boot — the URL is ignored anyway.

  const autorouteScenario = config.generation.autorouteScenario;
  if (
    autorouteScenario !== undefined &&
    !(AUTOROUTE_SCENARIOS as readonly string[]).includes(autorouteScenario,)
  ) {
    throw new Error(
      `Invalid generation.autorouteScenario: "${autorouteScenario}". Must be one of: ${
        AUTOROUTE_SCENARIOS.join(", ",)
      }`,
    );
  }

  validateFeatureProfile(config,);
  validateByoKey(config,);

  if (
    !Number.isFinite(config.server.port,) ||
    config.server.port < 0 || config.server.port > 65_535
  ) {
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

  // Prompt token budgets must sit inside the clamp bounds (sections/prompt.ts
  // clamps defensively; load-time validation surfaces the misconfiguration).
  const { min: budgetMin, max: budgetMax, } = PROMPT_BUDGET_BOUNDS;
  for (const field of ["loreTokenBudget", "memoryTokenBudget",] as const) {
    const value = config.prompt[field];
    if (!Number.isFinite(value,) || value < budgetMin || value > budgetMax) {
      throw new Error(
        `Invalid prompt.${field}: ${String(value,)}. Must be ${budgetMin}-${budgetMax}`,
      );
    }
  }

  // Declarative MCP servers: reject conflicting transports, shell-ish stdio
  // commands and non-http(s) endpoints at load, not at registration.
  validateMcpConfig(config.mcp,);

  // External harness profiles: duplicate names, unknown tier keys, and
  // non-`provider/id` models are config rot — reject at load, not at dispatch.
  validateAcpProfiles(config.harness.acp,);
  validateComfyUIModels(config,);
};
