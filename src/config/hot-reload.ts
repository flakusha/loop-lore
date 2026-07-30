// src/config/hot-reload.ts — Hot-reload domain config files
//
// Watches configs/ directory for changes and reloads domain configs
// without restarting the application.

import { type FSWatcher, watch, } from "node:fs";
import { createLogger, } from "../logger";
import { type Config, } from "./schema";

const log = createLogger({ level: "info", },);

// Domain config file patterns
const DOMAIN_CONFIG_EXTENSIONS = [".yaml", ".yml", ".toml",];
const DOMAINS = [
  "server",
  "database",
  "assets",
  "logging",
  "tui",
  "docs",
  "auth",
  "transport",
  "messages",
  "nsfw",
  "generation",
  "byokey",
  "encryption",
  "headers",
] as const;

type DomainReloadCallback = (domain: string, config: Config,) => void;

/**
 * Watch domain config files for changes and reload them.
 *
 * @param configsDir - The configs directory to watch
 * @param onReload - Callback when a domain config is reloaded
 * @returns FSWatcher instance
 */
function watchDomainConfigs(configsDir: string, onReload: DomainReloadCallback,): FSWatcher {
  const watcher = watch(configsDir, { recursive: false, }, (_eventType, filename,) => {
    if (!filename) { return; }

    // Check if this is a domain config file
    const isDomainConfig = DOMAINS.some((domain,) =>
      DOMAIN_CONFIG_EXTENSIONS.some((ext,) => filename === `config.${domain}${ext}`)
    );

    if (!isDomainConfig) { return; }

    // Extract domain name from filename
    const domain = DOMAINS.find((d,) => DOMAIN_CONFIG_EXTENSIONS.some((ext,) => filename === `config.${d}${ext}`));

    if (!domain) { return; }

    log.info(`Domain config changed: ${filename} (${domain})`,);

    // Reload the domain config
    // Dynamic import to avoid circular dependencies
    void import("./load").then(({ loadConfig, },) => {
      const config = loadConfig();
      onReload(domain, config,);
      log.info(`Reloaded domain config: ${domain}`,);
    },).catch((error,) => {
      log.error(
        `Failed to reload domain config ${domain}: ${error instanceof Error ? error.message : String(error,)}`,
      );
    },);
  },);

  log.info(`Watching domain configs in ${configsDir}`,);
  return watcher;
}

/**
 * Stop watching domain configs.
 *
 * @param watcher - The FSWatcher instance to stop
 */
function stopWatchingDomainConfigs(watcher: FSWatcher,): void {
  watcher.close();
  log.info("Stopped watching domain configs",);
}

export { stopWatchingDomainConfigs, watchDomainConfigs, };
