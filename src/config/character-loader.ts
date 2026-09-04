// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/character-loader.ts — Character file loader
//
// Loads character definitions from configs/characters/ directory.
// Supports single-character and multi-character files (YAML/TOML).
// Merges all found characters by name (user wins on conflict).

import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import type { ContentRating, } from "../characters/spec";
import { findMainRepoRoot, } from "../utils/git-worktree";
import type { CharacterTemplateConfig, } from "./sections/templates";

// ── Types ─────────────────────────────────────────────────────

interface CharacterFileData {
  /** Single character definition */
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  welcome_message?: string;
  system_prompt?: string;
  mes_example?: string;
  tags?: string[];
  creator?: string;
  id?: string;
  visibility?: "private" | "public";
  content_rating?: ContentRating;
  target_roles?: ("admin" | "user" | "viewer" | "solo")[];
  is_template?: boolean;
  is_default?: boolean;

  // ── Wardrobe / Outfits (epic-wardrobe-avatar-variants.md) ──
  // Optional. Existing emotion-only character files keep working without these.
  default_outfit?: string;
  outfits?: CharacterOutfit[];
  loadouts?: CharacterLoadout[];

  /** Multi-character file: array of character definitions */
  templates?: CharacterFileData[];
}

/** Wardrobe outfit descriptor — mirrors CharacterOutfitTemplate in sections/characters/types.ts */
interface CharacterOutfit {
  id: string;
  name: string;
  descriptor: string;
  tags?: string[];
}

/** Loadout bridge entry — mirrors CharacterLoadoutTemplate in sections/characters/types.ts */
interface CharacterLoadout {
  name: string;
  slot: string;
  item_match: string;
  outfit: string;
}

// ── File Discovery ────────────────────────────────────────────

/**
 * Find character files in configs/characters/ directory
 * @param cwd
 */
function findCharacterFiles(cwd: string,): string[] {
  const mainRoot = findMainRepoRoot(cwd,);
  const searchDirs = [
    path.join(cwd, "configs", "characters",),
    path.join(cwd, "characters",),
  ];
  if (mainRoot && mainRoot !== cwd) {
    searchDirs.push(
      path.join(mainRoot, "configs", "characters",),
      path.join(mainRoot, "characters",),
    );
  }

  const files: string[] = [];
  const seen = new Set<string>();

  for (const dir of searchDirs) {
    if (!existsSync(dir,) || !statSync(dir,).isDirectory()) { continue; }

    const entries = readdirSync(dir,);
    for (const entry of entries) {
      const ext = path.extname(entry,).toLowerCase();
      if (ext !== ".yaml" && ext !== ".yml" && ext !== ".toml") { continue; }

      const fullPath = path.join(dir, entry,);
      const canonical = path.resolve(fullPath,);
      if (seen.has(canonical,)) { continue; }
      seen.add(canonical,);

      files.push(fullPath,);
    }
  }

  return files.sort((a, b,) => a.localeCompare(b,));
}

// ── Parsing ───────────────────────────────────────────────────

/**
 * @param filePath
 */
function parseCharacterFile(filePath: string,): CharacterFileData {
  const content = readFileSync(filePath, "utf8",);
  const ext = path.extname(filePath,).slice(1,).toLowerCase();

  if (ext === "toml") {
    return Bun.TOML.parse(content,);
  }
  return Bun.YAML.parse(content,) as CharacterFileData;
}

// ── Normalization ─────────────────────────────────────────────

/**
 * Normalize a character file data into an array of templates
 * @param data
 */
function normalizeTemplates(data: CharacterFileData,): CharacterTemplateConfig["templates"] {
  // Multi-character file: has templates array
  if (data.templates && Array.isArray(data.templates,)) {
    return Array.from(data.templates, (t,) => ({
      id: t.id,
      name: t.name ?? "",
      description: t.description ?? "",
      personality: t.personality,
      scenario: t.scenario,
      welcome_message: t.welcome_message,
      system_prompt: t.system_prompt,
      mes_example: t.mes_example,
      tags: t.tags,
      creator: t.creator,
      visibility: t.visibility,
      content_rating: t.content_rating,
      target_roles: t.target_roles,
      is_template: t.is_template,
      is_default: t.is_default,
      default_outfit: t.default_outfit,
      outfits: t.outfits,
      loadouts: t.loadouts,
    }),);
  }

  // Single character file: has name + description
  if (data.name && data.description) {
    return [{
      id: data.id,
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      welcome_message: data.welcome_message,
      system_prompt: data.system_prompt,
      mes_example: data.mes_example,
      tags: data.tags,
      creator: data.creator,
      visibility: data.visibility,
      content_rating: data.content_rating,
      target_roles: data.target_roles,
      is_template: data.is_template,
      is_default: data.is_default,
      default_outfit: data.default_outfit,
      outfits: data.outfits,
      loadouts: data.loadouts,
    },];
  }

  return [];
}

// ── Main Loader ───────────────────────────────────────────────

/**
 * Load character definitions from configs/characters/ directory.
 * @param cwd - Working directory to search from (default: process.cwd())
 * @returns Array of character templates
 */
export function loadCharacterFiles(cwd?: string,): CharacterTemplateConfig["templates"] {
  const directory = cwd ?? process.cwd();
  const files = findCharacterFiles(directory,);

  const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();

  for (const filePath of files) {
    try {
      const data = parseCharacterFile(filePath,);
      const templates = normalizeTemplates(data,);

      for (const t of templates) {
        if (t.name) {
          merged.set(t.name.toLowerCase(), t,);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to load character file ${filePath}: ${(error as Error).message}`,
        { cause: error, },
      );
    }
  }

  return Array.from(merged.values(),);
}

export {
  findCharacterFiles,
};
export { findMainRepoRoot, } from "../utils/git-worktree";
