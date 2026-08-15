// src/config/migrate-config.ts — Migration tool to split monolithic config into domain files
//
// Usage: bun run src/config/migrate-config.ts --input configs/config.toml --dry-run
//        bun run src/config/migrate-config.ts --input configs/config.toml

import { load as parseYaml, } from "js-yaml";
import { existsSync, mkdirSync, readFileSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { parse as parseToml, } from "smol-toml";
import { createLogger, } from "../logger";
import { jsonStringifyOr, } from "../utils";

const log = createLogger({ level: "info", },);

// Domain definitions: maps domain name to the config path(s) it covers
const DOMAINS: Record<string, string[]> = {
  server: ["server",],
  database: ["db",],
  assets: ["assets",],
  logging: ["logging",],
  tui: ["tui",],
  docs: ["docs",],
  auth: ["auth", "ageGate",],
  transport: ["transport",],
  messages: ["messages",],
  nsfw: ["nsfw",],
  generation: ["generation",],
  byokey: ["byoKey",],
  encryption: ["encryption",],
  headers: ["headers",],
};

interface MigrationOptions {
  input: string;
  outputDir: string;
  dryRun: boolean;
  format: "toml" | "yaml";
}

function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2,);
  const options: MigrationOptions = {
    input: "",
    outputDir: "configs",
    dryRun: false,
    format: "toml",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--input" && i + 1 < args.length) {
      options.input = args[++i] ?? "";
    } else if (arg === "--output" && i + 1 < args.length) {
      options.outputDir = args[++i] ?? "configs";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--format" && i + 1 < args.length) {
      const format = args[++i];
      if (format === "toml" || format === "yaml") {
        options.format = format;
      }
    }
  }

  if (!options.input) {
    log.fatal("Missing required argument: --input <config-file>",);
    process.exit(1,);
  }

  return options;
}

function parseConfigFile(filePath: string,): Record<string, unknown> {
  const content = readFileSync(filePath, "utf8",);
  const ext = path.extname(filePath,).slice(1,);

  if (ext === "yaml" || ext === "yml") {
    return parseYaml(content,) as Record<string, unknown>;
  }
  if (ext === "toml") {
    return parseToml(content,);
  }
  throw new Error(`Unknown config file extension: .${ext}`,);
}

function extractDomainConfig(
  fullConfig: Record<string, unknown>,
  domainPaths: string[],
): Record<string, unknown> {
  const domainConfig: Record<string, unknown> = {};
  for (const domainPath of domainPaths) {
    if (fullConfig[domainPath] !== undefined) {
      domainConfig[domainPath] = fullConfig[domainPath];
    }
  }
  return domainConfig;
}

function formatConfig(config: Record<string, unknown>, format: "toml" | "yaml",): string {
  return format === "yaml" ? formatYaml(config,) : formatToml(config,);
}

/** Serialize a config object as simple YAML (one level of nesting). */
function formatYaml(config: Record<string, unknown>,): string {
  const lines: string[] = [];
  for (const [key, value,] of Object.entries(config,)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`${key}:`,);
      for (const [subKey, subValue,] of Object.entries(value as Record<string, unknown>,)) {
        lines.push(`  ${subKey}: ${jsonStringifyOr(subValue, "undefined",)}`,);
      }
    } else {
      lines.push(`${key}: ${jsonStringifyOr(value, "undefined",)}`,);
    }
  }
  return `${lines.join("\n",)}\n`;
}

/** Serialize a config object as TOML (one level of nesting). */
function formatToml(config: Record<string, unknown>,): string {
  const lines: string[] = [];
  for (const [key, value,] of Object.entries(config,)) {
    if (typeof value === "object" && value !== null) {
      lines.push(`[${key}]`,);
      for (const [subKey, subValue,] of Object.entries(value as Record<string, unknown>,)) {
        lines.push(`${subKey} = ${tomlValue(subValue,)}`,);
      }
      lines.push("",);
    } else {
      lines.push(`${key} = ${tomlValue(value,)}`,);
    }
  }
  return lines.join("\n",);
}

/** Format a scalar as a TOML literal (strings quoted). */
function tomlValue(value: unknown,): string {
  if (typeof value === "string") { return `"${value}"`; }
  return jsonStringifyOr(value, "undefined",);
}

function main() {
  const options = parseArgs();

  // Read and parse input config
  if (!existsSync(options.input,)) {
    log.fatal(`Input file not found: ${options.input}`,);
    process.exit(1,);
  }

  const fullConfig = parseConfigFile(options.input,);
  log.info(`Parsed config file: ${options.input}`,);

  // Create output directory if not dry-run
  if (!options.dryRun) {
    mkdirSync(options.outputDir, { recursive: true, },);
  }

  // Extract and write domain configs
  let migrated = 0;
  for (const [domain, paths,] of Object.entries(DOMAINS,)) {
    const domainConfig = extractDomainConfig(fullConfig, paths,);

    if (Object.keys(domainConfig,).length === 0) {
      log.info(`Skipping ${domain}: no config found`,);
      continue;
    }

    const filename = `config.${domain}.${options.format}`;
    const outputPath = path.join(options.outputDir, filename,);
    const content = formatConfig(domainConfig, options.format,);

    if (options.dryRun) {
      log.info(`[DRY RUN] Would create: ${outputPath}`,);
      log.info(`Content:\n${content}`,);
    } else {
      writeFileSync(outputPath, content,);
      log.info(`Created: ${outputPath}`,);
    }
    migrated++;
  }

  log.info(`Migrated ${migrated} domain configs`,);
  if (options.dryRun) {
    log.info("Dry run complete. No files were written.",);
  }
}

main();
