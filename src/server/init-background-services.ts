// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../config/schema/config";
import type { Db, } from "../db/index";
import { OpenAiCompatibleProvider, registerProvider, } from "../generation";
import type { Logger, } from "../logger/types";
import type { ServerExternalManager, } from "../services/server-external-manager";

/**
 * Run non-blocking background initialization: character-template seeding and
 * auto-start of external AI servers (llama.cpp, llama-swap, sd.cpp).
 *
 * Returns once every background job has settled (success or failure — errors
 * are logged, never thrown, so startup is resilient to optional components).
 */
export async function initBackgroundServices(
  database: Db,
  config: Config,
  logger: Logger,
  serverManager: ServerExternalManager,
): Promise<void> {
  const initPromises: Promise<void>[] = [];

  // Seed character templates from config (idempotent)
  if (config.characters.enabled) {
    initPromises.push(
      (async () => {
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
    );
  }

  // Auto-start external AI servers (llama.cpp, sd.cpp) in background
  const autoStart = config.generation.autoStart;
  if (autoStart) {
    const llamaCppCfg = autoStart?.llamaCpp;
    if (llamaCppCfg?.enabled) {
      logger.info("auto-starting llama.cpp", { module: "server", port: llamaCppCfg.port, },);
      initPromises.push(
        (async () => {
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
            if (!config.generation.defaultProvider) {
              config.generation.defaultProvider = name;
            }
            config.generation.defaultModels[name] ??= name;
          }
        })(),
      );
    }
    const llamaSwapCfg = autoStart?.llamaSwap;
    if (llamaSwapCfg?.enabled) {
      logger.info("auto-starting llama-swap", {
        module: "server",
        configPath: llamaSwapCfg.configPath,
      },);
      initPromises.push(
        (async () => {
          const instance = await serverManager.startLlamaSwap({ configPath: llamaSwapCfg.configPath, },);
          if (instance) {
            logger.info(`llama-swap ready → http://127.0.0.1:${instance.port}`,);
          } else {
            logger.warn("llama-swap auto-start failed or skipped", { module: "server", },);
          }
        })(),
      );
    }
    const sdCppCfg = autoStart?.sdCpp;
    if (sdCppCfg?.enabled) {
      logger.info("auto-starting sd-cpp", { module: "server", port: sdCppCfg.port, },);
      initPromises.push(
        (async () => {
          const instance = await serverManager.startSdCpp(sdCppCfg,);
          if (!instance) {
            logger.warn("sd-cpp auto-start failed or skipped", { module: "server", },);
          }
        })(),
      );
    }
  } else {
    logger.debug("autoStart not configured — skipping external server launch", { module: "server", },);
  }

  // Resolve all background init before proceeding to rest
  await Promise.allSettled(initPromises,);
}
