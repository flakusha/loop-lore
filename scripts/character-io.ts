#!/usr/bin/env bun
// scripts/character-io.ts
//
// CLI tool for character import/export operations.
//
// Usage:
//   bun run scripts/character-io.ts import <file> [--format json|yaml|toml]
//   bun run scripts/character-io.ts export <character-id> [--format png|json|yaml|toml|charx]
//   bun run scripts/character-io.ts export-all [--format json|yaml] [--output <dir>]
//   bun run scripts/character-io.ts detect <file>

import { existsSync, mkdirSync, readFileSync, writeFileSync, } from "node:fs";
import { basename, join, } from "node:path";
import { exportToCcV2Json, } from "../src/characters/exporters/ccv2";
import { exportToCcV3Json, } from "../src/characters/exporters/ccv3";
import { exportToToml, } from "../src/characters/exporters/toml";
import { exportToYaml, } from "../src/characters/exporters/yaml";
import { parseCharacterCard, validateCharacter, } from "../src/characters/parser";

const args = process.argv.slice(2,);
const command = args[0];

function printUsage(): void {
  console.log(`
Character IO — Import/Export CLI

Usage:
  character-io import <file>                Import a character card
  character-io export <file> [--format FMT] Export to format (json|yaml|toml|ccv2|ccv3)
  character-io detect <file>                Detect character card format
  character-io validate <file>              Validate character card

Options:
  --format <fmt>   Output format (default: json)
  --output <dir>   Output directory (default: stdout)
  --pretty         Pretty-print JSON output

Examples:
  character-io import character.png
  character-io export character.json --format yaml
  character-io detect my-character.charx
  `,);
}

function detectFormat(filePath: string,): void {
  const content = readFileSync(filePath,);
  const filename = basename(filePath,);

  parseCharacterCard(content, filename,)
    .then((result,) => {
      console.log(`Format: ${result.format}`,);
      console.log(`Name: ${result.character.name}`,);
      if (result.warnings.length > 0) {
        console.log("Warnings:",);
        for (const warning of result.warnings) {
          console.log(`  - ${warning}`,);
        }
      }
    },)
    .catch((error,) => {
      console.error(`Error: ${error.message}`,);
      process.exit(1,);
    },);
}

function importCharacter(filePath: string,): void {
  const content = readFileSync(filePath,);
  const filename = basename(filePath,);

  parseCharacterCard(content, filename,)
    .then((result,) => {
      // Validate
      const errors = validateCharacter(result.character,);
      if (errors.length > 0) {
        console.error("Validation errors:",);
        for (const error of errors) {
          console.error(`  - ${error}`,);
        }
        process.exit(1,);
      }

      // Output parsed character
      console.log(JSON.stringify(result.character, null, 2,),);
      console.error(`\nParsed ${result.format} character: ${result.character.name}`,);
      if (result.warnings.length > 0) {
        console.error("Warnings:",);
        for (const warning of result.warnings) {
          console.error(`  - ${warning}`,);
        }
      }
    },)
    .catch((error,) => {
      console.error(`Error: ${error.message}`,);
      process.exit(1,);
    },);
}

function exportCharacter(filePath: string, format: string, outputDir?: string,): void {
  const content = readFileSync(filePath,);
  const filename = basename(filePath,);

  parseCharacterCard(content, filename,)
    .then((result,) => {
      let output: string;
      let ext: string;

      switch (format) {
        case "yaml":
          output = exportToYaml(result.character,);
          ext = "yaml";
          break;
        case "toml":
          output = exportToToml(result.character,);
          ext = "toml";
          break;
        case "ccv2":
          output = exportToCcV2Json(result.character,);
          ext = "json";
          break;
        case "ccv3":
        case "json":
        default:
          output = exportToCcV3Json(result.character,);
          ext = "json";
          break;
      }

      if (outputDir) {
        if (!existsSync(outputDir,)) {
          mkdirSync(outputDir, { recursive: true, },);
        }
        const outFilename = filename.replace(/\.[^.]+$/, `.${ext}`,);
        const outPath = join(outputDir, outFilename,);
        writeFileSync(outPath, output,);
        console.log(`Exported to: ${outPath}`,);
      } else {
        console.log(output,);
      }
    },)
    .catch((error,) => {
      console.error(`Error: ${error.message}`,);
      process.exit(1,);
    },);
}

function validateCharacterFile(filePath: string,): void {
  const content = readFileSync(filePath,);
  const filename = basename(filePath,);

  parseCharacterCard(content, filename,)
    .then((result,) => {
      const errors = validateCharacter(result.character,);
      if (errors.length > 0) {
        console.error("Validation errors:",);
        for (const error of errors) {
          console.error(`  - ${error}`,);
        }
        process.exit(1,);
      } else {
        console.log(`Valid ${result.format} character: ${result.character.name}`,);
        console.log("All required fields present.",);
      }
    },)
    .catch((error,) => {
      console.error(`Error: ${error.message}`,);
      process.exit(1,);
    },);
}

// Parse options
let format = "json";
let outputDir: string | undefined;

for (let i = 2; i < args.length; i++) {
  if (args[i] === "--format" && args[i + 1]) {
    format = args[i + 1]!;
    i++;
  } else if (args[i] === "--output" && args[i + 1]) {
    outputDir = args[i + 1];
    i++;
  }
}

// Execute command
switch (command) {
  case "import":
    if (!args[1]) {
      console.error("Error: file path required",);
      printUsage();
      process.exit(1,);
    }
    importCharacter(args[1],);
    break;

  case "export":
    if (!args[1]) {
      console.error("Error: file path required",);
      printUsage();
      process.exit(1,);
    }
    exportCharacter(args[1], format, outputDir,);
    break;

  case "detect":
    if (!args[1]) {
      console.error("Error: file path required",);
      printUsage();
      process.exit(1,);
    }
    detectFormat(args[1],);
    break;

  case "validate":
    if (!args[1]) {
      console.error("Error: file path required",);
      printUsage();
      process.exit(1,);
    }
    validateCharacterFile(args[1],);
    break;

  default:
    printUsage();
    process.exit(1,);
}
