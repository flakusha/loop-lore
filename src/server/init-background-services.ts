// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../config/schema/config";
import type { Db, } from "../db/index";
import { OpenAiCompatibleProvider, registerProvider, } from "../generation";
import { circuitBreaker, } from "../generation/providers/circuit-breaker";
import {
  getHonkboxCapabilities,
  HONKBOX_FEATURE_KEYS,
  isHonkboxFeatureEnabled,
} from "../integrations/honkbox/capabilities";
import { readEffectiveLlamaSwapConfig, } from "../llm/llama-swap-effective-config";
import type { Logger, } from "../logger/types";
import { setRegexTelemetryEnabled, } from "../regex/telemetry";
import { flushRegexTelemetry, } from "../regex/telemetry-flush";
import type { ServerExternalManager, } from "../services/server-external-manager";
import { loadTelemetryConfig, } from "../telemetry/config";

/** Handle for the background services started by {@link initBackgroundServices}. */
export interface BackgroundServicesHandle {
  /** Clear background timers so no flush writes land after teardown. */
  stop(): void;
}

/**
 * Run non-blocking background initialization: character-template seeding and
 * auto-start of external AI servers (llama.cpp, llama-swap, sd.cpp).
 *
 * Returns once every background job has settled (success or failure — errors
 * are logged, never thrown, so startup is resilient to optional components).
 * @param database
 * @param config
 * @param logger
 * @param serverManager
 * @returns {Promise<BackgroundServicesHandle>} handle that clears the background timers.
 */
export async function initBackgroundServices(
  database: Db,
  config: Config,
  logger: Logger,
  serverManager: ServerExternalManager,
): Promise<BackgroundServicesHandle> {
  const initJobs: { name: string; promise: Promise<void> }[] = [];

  // Seed character templates from config (idempotent)
  if (config.characters.enabled) {
    initJobs.push({
      name: "character-templates",
      promise: (async () => {
        const { seedCharacterTemplates, mergeCharacterTemplates, } = await import("../characters/seed");
        const { CHARACTERS_DEFAULTS, } = await import("../config/sections/characters");

        // Use character templates from template loader (configs/templates/character.yaml)
        // Merge built-in defaults with template-loaded characters
        const templateCharacters = config.templates.character.templates;
        const mergedTemplates = mergeCharacterTemplates(
          CHARACTERS_DEFAULTS.templates,
          templateCharacters,
        );

        const mergedConfig = { ...config.characters, templates: mergedTemplates, };
        const result = await seedCharacterTemplates(database, mergedConfig, null, config.assets.uploadDir,);
        if (result.created > 0) {
          logger.info("character templates seeded", {
            module: "server",
            created: result.created,
            skipped: result.skipped,
          },);
        }

        if (result.errors.length > 0) {
          logger.warn("character template seeding had errors", { module: "server", errors: result.errors, },);
        }
      })(),
    },);
  }

  // Seed item templates from config (idempotent)
  if (config.items.enabled) {
    initJobs.push({
      name: "item-templates",
      promise: (async () => {
        const { mergeItemTemplates, seedItemTemplates, } = await import("../items/seed");
        const { ITEMS_DEFAULTS, } = await import("../config/sections/items");

        // Merge built-in defaults with user config templates
        const mergedConfig = {
          ...config.items,
          templates: mergeItemTemplates(ITEMS_DEFAULTS.templates, config.items.templates,),
        };

        const result = await seedItemTemplates(database, mergedConfig,);
        if (result.created > 0) {
          logger.info("item templates seeded", {
            module: "server",
            created: result.created,
            skipped: result.skipped,
          },);
        }

        if (result.errors.length > 0) {
          logger.warn("item template seeding had errors", { module: "server", errors: result.errors, },);
        }
      })(),
    },);
  }

  // Auto-start external AI servers (llama.cpp, sd.cpp) in background
  const autoStart = config.generation.autoStart;
  if (autoStart) {
    const llamaCppCfg = autoStart?.llamaCpp;
    if (llamaCppCfg?.enabled) {
      logger.info("auto-starting llama.cpp", { module: "server", port: llamaCppCfg.port, },);
      initJobs.push({
        name: "llama.cpp",
        promise: (async () => {
          const instance = await serverManager.startLlamaCpp(llamaCppCfg,);
          if (instance) {
            const name = llamaCppCfg.alias || "llama";
            registerProvider(
              name,
              new OpenAiCompatibleProvider({
                name,
                label: "Auto-started llama.cpp",
                baseUrl: `http://127.0.0.1:${instance.port}/v1`,
                model: name,
                timeout: 30_000,
                retries: 3,
                allowUserApiKey: false,
                models: {},
              },),
            );

            circuitBreaker.register(name,);

            if (!config.generation.defaultProvider) {
              config.generation.defaultProvider = name;
            }

            config.generation.defaultModels[name] ??= name;
          }
        })(),
      },);
    }

    const llamaSwapFileCfg = autoStart?.llamaSwap;
    if (llamaSwapFileCfg) {
      const llamaSwapCfg = await readEffectiveLlamaSwapConfig(database, llamaSwapFileCfg,);
      if (llamaSwapCfg?.enabled) {
        logger.info("auto-starting llama-swap", {
          module: "server",
          configPath: llamaSwapCfg.configPath,
        },);

        initJobs.push({
          name: "llama-swap",
          promise: (async () => {
            const instance = await serverManager.startLlamaSwap({
              configPath: llamaSwapCfg.configPath,
              listenPort: llamaSwapCfg.listenPort,
            },);

            if (instance) {
              const name = "llama-swap";
              registerProvider(
                name,
                new OpenAiCompatibleProvider({
                  name,
                  label: "Auto-started llama-swap",
                  baseUrl: `http://127.0.0.1:${instance.port}/v1`,
                  model: name,
                  timeout: 30_000,
                  retries: 3,
                  allowUserApiKey: false,
                  models: {},
                },),
              );

              circuitBreaker.register(name,);

              if (!config.generation.defaultProvider) {
                config.generation.defaultProvider = name;
              }

              config.generation.defaultModels[name] ??= name;

              logger.info(`llama-swap ready → http://127.0.0.1:${instance.port}`,);
            } else {
              logger.warn("llama-swap auto-start failed or skipped", { module: "server", },);
            }
          })(),
        },);
      }
    }

    const sdCppCfg = autoStart?.sdCpp;
    if (sdCppCfg?.enabled) {
      logger.info("auto-starting sd-cpp", { module: "server", port: sdCppCfg.port, },);
      initJobs.push({
        name: "sd.cpp",
        promise: (async () => {
          const instance = await serverManager.startSdCpp(sdCppCfg,);
          if (!instance) {
            logger.warn("sd-cpp auto-start failed or skipped", { module: "server", },);
          }
        })(),
      },);
    }

    const honkboxCfg = autoStart?.honkbox;
    if (honkboxCfg?.enabled) {
      const port = honkboxCfg.port ?? 9010;
      logger.info("auto-starting honkbox", { module: "server", port, },);
      initJobs.push({
        name: "honkbox",
        promise: (async () => {
          const instance = await serverManager.startHonkbox({ ...honkboxCfg, port, },);
          if (!instance) {
            logger.warn("honkbox auto-start failed or skipped", { module: "server", },);
            return;
          }

          // Supplemental provider: unlike llama.cpp, this never hijacks
          // generation.defaultProvider / defaultModels.
          registerProvider(
            "honkbox",
            new OpenAiCompatibleProvider({
              name: "honkbox",
              label: "Auto-started honkbox",
              baseUrl: `http://127.0.0.1:${instance.port}/v1`,
              model: honkboxCfg.model ?? "local-chat",
              timeout: 60_000,
              retries: 2,
              allowUserApiKey: false,
              ...(honkboxCfg.apiKey ? { apiKey: honkboxCfg.apiKey, } : {}),
              models: {},
            },),
          );

          circuitBreaker.register("honkbox",);

          // Probe capabilities at setup — never assumed. A failed probe
          // does NOT unregister the provider; honkbox features degrade off.
          const probe = await getHonkboxCapabilities({
            baseUrl: `http://127.0.0.1:${instance.port}/v1`,
            ...(honkboxCfg.apiKey ? { apiKey: honkboxCfg.apiKey, } : {}),
          },);

          if (probe.ok) {
            const features = HONKBOX_FEATURE_KEYS.filter((key,) => isHonkboxFeatureEnabled(probe, key,));
            logger.info("honkbox capabilities probed", {
              module: "server",
              supported: probe.supported,
              features,
            },);
          } else {
            logger.warn("honkbox capabilities probe failed — provider stays registered", {
              module: "server",
              reason: probe.reason,
              detail: probe.detail,
            },);
          }
        })(),
      },);
    }
  } else {
    logger.debug("autoStart not configured — skipping external server launch", { module: "server", },);
  }

  // Opt-in regex precision counters (TELEMETRY_REGEX_PRECISION=1)
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  if (loadTelemetryConfig().regexPrecision) {
    setRegexTelemetryEnabled(true,);
    flushTimer = setInterval(() => {
      void flushRegexTelemetry(database,).catch((error: unknown,) => {
        logger.warn("regex telemetry flush failed", { module: "server", error: String(error,), },);
      },);
    }, 60_000,);

    flushTimer.unref();
  }

  // Resolve all background init before proceeding to rest
  const results = await Promise.allSettled(initJobs.map((job,) => job.promise),);
  results.forEach((result, index,) => {
    if (result.status !== "rejected") { return; }
    const job = initJobs[index];
    logger.error(
      "background init failed",
      result.reason instanceof Error ? result.reason : new Error(String(result.reason,),),
      { module: "server", job: job?.name ?? "unknown", },
    );
  },);

  return {
    stop() {
      if (flushTimer === undefined) { return; }
      clearInterval(flushTimer,);
      flushTimer = undefined;
    },
  };
}
