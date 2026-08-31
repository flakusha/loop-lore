// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/domain.ts — Domain-specific config loading & validation

import { existsSync, readFileSync, } from "node:fs";
import path from "node:path";
import type { Config, } from "../schema";
import { DOMAIN_CONFIG_EXTENSIONS, DOMAINS, } from "./constants";
import { deepMerge, parseFileContent, } from "./parse";

/**
 * Load domain-specific config files from configs/ directory.
 *
 * Each domain file (config.<domain>.yaml/yml/toml) is loaded and merged
 * into the base config. Domain configs override the main config.
 * @param directory - The directory to search for domain configs
 * @param baseConfig - The base config to merge domain configs into
 * @returns Merged config with domain overrides applied
 */
export function loadDomainConfigs(directory: string, baseConfig: Config,): Config {
  const configsDir = path.join(directory, "configs",);
  let config = baseConfig;

  for (const domain of DOMAINS) {
    for (const ext of DOMAIN_CONFIG_EXTENSIONS) {
      const domainFile = `config.${domain}${ext}`;
      const domainPath = path.join(configsDir, domainFile,);
      if (existsSync(domainPath,)) {
        try {
          const content = readFileSync(domainPath, "utf8",);
          const parsed = parseFileContent(content, ext.slice(1,),);
          validateDomainConfig(domain, parsed, domainPath,);
          config = deepMerge(config as unknown as Record<string, unknown>, parsed,) as unknown as Config;
        } catch (error) {
          throw new Error(`Failed to parse domain config ${domainPath}: ${(error as Error).message}`, {
            cause: error,
          },);
        }
        break; // First found wins per domain
      }
    }
  }

  return config;
}

/**
 * Validate a domain config against its expected structure.
 * @param domain - The domain name (e.g., "server", "database")
 * @param parsed - The parsed config object
 * @param filePath - The file path for error messages
 */

/**
 * Validate the server domain: port range.
 * @param parsed
 * @param filePath
 */
function validateServerDomain(parsed: Record<string, unknown>, filePath: string,): void {
  const server = parsed.server as Record<string, unknown> | undefined;
  if (server?.port === undefined) { return; }
  const port = Number(server.port,);
  if (isNaN(port,) || port < 0 || port > 65_535) {
    throw new Error(`Invalid server.port in ${filePath}: ${server.port as unknown as string}. Must be 0-65535`,);
  }
}

/**
 * Validate the database domain: type + postgres url requirement.
 * @param parsed
 * @param filePath
 */
function validateDatabaseDomain(parsed: Record<string, unknown>, filePath: string,): void {
  const db = parsed.db as Record<string, unknown> | undefined;
  if (!db) { return; }
  if (db.type !== undefined && !["sqlite", "postgres",].includes(db.type as string,)) {
    throw new Error(
      `Invalid db.type in ${filePath}: "${db.type as unknown as string}". Must be "sqlite" or "postgres"`,
    );
  }
  if (db.type === "postgres" && !db.url) {
    throw new Error(`db.url is required when db.type is 'postgres' in ${filePath}`,);
  }
}

/**
 * Validate the logging domain: level enum.
 * @param parsed
 * @param filePath
 */
function validateLoggingDomain(parsed: Record<string, unknown>, filePath: string,): void {
  const logging = parsed.logging as Record<string, unknown> | undefined;
  if (
    logging?.level !== undefined &&
    !["trace", "debug", "info", "warn", "error", "fatal",].includes(logging.level as string,)
  ) {
    throw new Error(
      `Invalid logging.level in ${filePath}: "${logging
        .level as unknown as string}". Must be trace/debug/info/warn/error/fatal`,
    );
  }
}

/**
 * @param domain
 * @param parsed
 * @param filePath
 */
export function validateDomainConfig(domain: string, parsed: Record<string, unknown>, filePath: string,): void {
  // Validate domain-specific constraints
  switch (domain) {
    case "server": {
      validateServerDomain(parsed, filePath,);
      break;
    }
    case "database": {
      validateDatabaseDomain(parsed, filePath,);
      break;
    }
    case "logging": {
      validateLoggingDomain(parsed, filePath,);
      break;
    }
    case "headers": {
      const headers = parsed.headers as Record<string, unknown> | undefined;
      if (
        headers?.xFrameOptions !== undefined && headers.xFrameOptions !== null &&
        !["DENY", "SAMEORIGIN",].includes(headers.xFrameOptions as string,)
      ) {
        throw new Error(
          `Invalid headers.xFrameOptions in ${filePath}: "${headers
            .xFrameOptions as unknown as string}". Must be DENY or SAMEORIGIN`,
        );
      }
      break;
    }
      // Other domains have no specific validation constraints
  }
}
