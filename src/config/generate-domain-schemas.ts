// src/config/generate-domain-schemas.ts — Generate JSON Schema for each domain config
//
// Usage: bun run src/config/generate-domain-schemas.ts
// Outputs: schemas/config.<domain>.schema.json for each domain
//
// Each domain schema is a subset of the full ConfigSchema.

import { writeFileSync, } from "node:fs";
import { dirname, } from "node:path";
import { fileURLToPath, } from "node:url";
import { createLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { jsonSchema, } from "./schema-class";

const __dirname = dirname(fileURLToPath(import.meta.url,),);
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

function main() {
  const fullSchema = jsonSchema();
  let generated = 0;

  for (const [domain, paths,] of Object.entries(DOMAINS,)) {
    // Extract domain-specific properties from full schema
    const domainSchema: Record<string, unknown> = {
      $schema: "https://json-schema.org/draft-07/schema#",
      $id: `loop-lore-config.${domain}.schema.json`,
      title: `Loop Lore ${domain.charAt(0,).toUpperCase() + domain.slice(1,)} Config`,
      description: `Domain-specific configuration for ${domain}`,
      type: "object",
      properties: {},
      required: [],
    };

    // Extract properties for this domain
    const fullProperties = fullSchema.properties as Record<string, unknown>;
    const domainProperties: Record<string, unknown> = {};
    const domainRequired: string[] = [];

    for (const path of paths) {
      if (!fullProperties[path]) {
        continue;
      }

      domainProperties[path] = fullProperties[path];
      // Check if required in full schema
      const fullRequired = fullSchema.required as string[] | undefined;
      if (fullRequired?.includes(path,)) {
        domainRequired.push(path,);
      }
    }

    domainSchema.properties = domainProperties;
    if (domainRequired.length > 0) {
      domainSchema.required = domainRequired;
    }

    // Write domain schema
    const outputPath = `${__dirname}/../../schemas/config.${domain}.schema.json`;
    try {
      const r = safeJsonStringify(domainSchema, 2,);
      writeFileSync(outputPath, r.ok ? r.value : "{}",);
      log.info(`Generated domain schema: ${outputPath}`,);
      generated++;
    } catch (error) {
      log.error(`Failed to write domain schema ${domain}: ${error instanceof Error ? error.message : String(error,)}`,);
    }
  }

  log.info(`Generated ${generated} domain schemas`,);
}

main();
