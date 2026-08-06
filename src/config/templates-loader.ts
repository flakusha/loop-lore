// src/config/templates-loader.ts — Template config file loader
//
// Finds and loads template config files (YAML or TOML) from configs/templates/ directory.
// YAML takes priority over TOML (if both exist, YAML wins).
// Applies per-domain merge strategies (replace, extend, override).

import { load as parseYaml, } from "js-yaml";
import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { parse as parseToml, } from "smol-toml";
import { loadCharacterFiles, } from "./character-loader";
import type {
  AvatarTemplateConfig,
  CharacterTemplateConfig,
  ChatFormatTemplate,
  ImageEditTemplateConfig,
  LlmTemplateConfig,
  MergeStrategy,
  SdTemplateConfig,
  TemplatesConfig,
} from "./sections/templates";
import { TEMPLATES_DEFAULTS, } from "./sections/templates";

// ── File Discovery ──────────────────────────────────────────

/** Template file names mapped to domain keys. YAML before TOML (YAML wins). */
const TEMPLATE_FILES: Record<string, keyof TemplatesConfig> = {
  "llm.yaml": "llm",
  "llm.yml": "llm",
  "llm.toml": "llm",
  "sd.yaml": "sd",
  "sd.yml": "sd",
  "sd.toml": "sd",
  "avatar.yaml": "avatar",
  "avatar.yml": "avatar",
  "avatar.toml": "avatar",
  "image-edit.yaml": "imageEdit",
  "image-edit.yml": "imageEdit",
  "image-edit.toml": "imageEdit",
  "character.yaml": "character",
  "character.yml": "character",
  "character.toml": "character",
};

/**
 * Detect if cwd is a git worktree and return the main repo root.
 * Same logic as load.ts — duplicated to avoid circular import.
 */
function findMainRepoRoot(cwd: string,): string | null {
  const gitPath = path.join(cwd, ".git",);
  if (!existsSync(gitPath,)) { return null; }

  try {
    if (statSync(gitPath,).isDirectory()) { return null; }
  } catch {
    return null;
  }

  const content = readFileSync(gitPath, "utf8",).trim();
  const match = /^gitdir:\s*(.+)$/.exec(content,);
  if (!match) { return null; }

  const gitdir = match[1]!;
  const worktreesDir = path.dirname(gitdir,);
  const gitDir = path.dirname(worktreesDir,);
  const mainRoot = path.dirname(gitDir,);

  const mainGitPath = path.join(mainRoot, ".git",);
  if (existsSync(mainGitPath,)) {
    try {
      if (statSync(mainGitPath,).isDirectory()) { return mainRoot; }
    } catch {
      // fall through
    }
  }
  return null;
}

/** Find template files in search directories */
function findTemplateFiles(cwd: string,): Map<string, string> {
  const mainRoot = findMainRepoRoot(cwd,);
  const searchDirs = [
    path.join(cwd, "configs", "templates",),
    path.join(cwd, "templates",),
  ];
  if (mainRoot && mainRoot !== cwd) {
    searchDirs.push(
      path.join(mainRoot, "configs", "templates",),
      path.join(mainRoot, "templates",),
    );
  }

  const found = new Map<string, string>();

  for (const dir of searchDirs) {
    if (!existsSync(dir,) || !statSync(dir,).isDirectory()) { continue; }

    for (const [filename, domain,] of Object.entries(TEMPLATE_FILES,)) {
      if (found.has(domain,)) { continue; // first match wins
       }

      const fullPath = path.join(dir, filename,);
      if (existsSync(fullPath,)) {
        found.set(domain, fullPath,);
      }
    }
  }

  return found;
}

// ── Parsing ─────────────────────────────────────────────────

function parseTemplateFile(filePath: string,): Record<string, unknown> {
  const content = readFileSync(filePath, "utf8",);
  const ext = path.extname(filePath,).slice(1,);
  if (ext === "toml") {
    return parseToml(content,);
  }
  return parseYaml(content,) as Record<string, unknown>;
}

// ── Merge Strategies ────────────────────────────────────────

/** Apply merge strategy for LLM templates */
function mergeLlmConfig(
  base: LlmTemplateConfig,
  override: Partial<LlmTemplateConfig>,
  strategy: MergeStrategy,
): LlmTemplateConfig {
  if (strategy === "replace") {
    return { ...base, ...override, merge: "extend", } as LlmTemplateConfig;
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      systemPrompts: { ...base.systemPrompts, ...override.systemPrompts, },
      chatFormats: { ...base.chatFormats, ...override.chatFormats, },
    };
  }

  // extend: add new keys, config wins on conflict
  return {
    ...base,
    ...override,
    merge: base.merge,
    systemPrompts: { ...base.systemPrompts, ...override.systemPrompts, },
    chatFormats: { ...base.chatFormats, ...override.chatFormats, },
  };
}

/** Apply merge strategy for SD templates */
function mergeSdConfig(
  base: SdTemplateConfig,
  override: Partial<SdTemplateConfig>,
  strategy: MergeStrategy,
): SdTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      profiles: override.profiles ?? {},
      modelMatching: override.modelMatching ?? [],
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      profiles: { ...base.profiles, ...override.profiles, },
      modelMatching: override.modelMatching ?? base.modelMatching,
    };
  }

  // extend: add new profiles/rules, config wins on conflict
  return {
    ...base,
    ...override,
    merge: base.merge,
    profiles: { ...base.profiles, ...override.profiles, },
    modelMatching: [...base.modelMatching, ...(override.modelMatching ?? []),],
  };
}

/** Apply merge strategy for avatar templates */
function mergeAvatarConfig(
  base: AvatarTemplateConfig,
  override: Partial<AvatarTemplateConfig>,
  strategy: MergeStrategy,
): AvatarTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      emotions: override.emotions ?? {},
      intentPatterns: override.intentPatterns ?? [],
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      emotions: { ...base.emotions, ...override.emotions, },
      intentPatterns: override.intentPatterns ?? base.intentPatterns,
    };
  }

  // extend: consensus semantics shared with expandAvatarConfig —
  // base emotions win on key conflicts; intent patterns are appended with
  // (pattern, emotion) dedup so repeated overrides don't duplicate entries.
  const mergedEmotions = { ...base.emotions, };
  if (override.emotions) {
    for (const [key, value,] of Object.entries(override.emotions,)) {
      if (!Object.prototype.hasOwnProperty.call(mergedEmotions, key,)) {
        mergedEmotions[key] = value;
      }
    }
  }
  const mergedPatterns = [...base.intentPatterns,];
  if (override.intentPatterns) {
    for (const pattern of override.intentPatterns) {
      if (mergedPatterns.every((p,) => p.pattern !== pattern.pattern || p.emotion !== pattern.emotion)) {
        mergedPatterns.push(pattern,);
      }
    }
  }
  return {
    merge: base.merge,
    emotions: mergedEmotions,
    intentPatterns: mergedPatterns,
  };
}

/** Apply merge strategy for image-edit templates */
function mergeImageEditConfig(
  base: ImageEditTemplateConfig,
  override: Partial<ImageEditTemplateConfig>,
  strategy: MergeStrategy,
): ImageEditTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      workflows: override.workflows ?? {},
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      workflows: { ...base.workflows, ...override.workflows, },
    };
  }

  // extend: add new workflows, config wins on conflict
  return {
    ...base,
    ...override,
    merge: base.merge,
    workflows: { ...base.workflows, ...override.workflows, },
  };
}

/** Apply merge strategy for character templates */
function mergeCharacterConfig(
  base: CharacterTemplateConfig,
  override: Partial<CharacterTemplateConfig>,
  strategy: MergeStrategy,
): CharacterTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      templates: override.templates ?? [],
    };
  }

  if (strategy === "override") {
    // Override: user templates replace built-in by name
    const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();
    for (const t of base.templates) {
      merged.set(t.name.toLowerCase(), t,);
    }
    const overrideTemplates = override.templates ?? [];
    for (const t of overrideTemplates) {
      merged.set(t.name.toLowerCase(), t,);
    }
    return {
      ...base,
      ...override,
      merge: base.merge,
      templates: Array.from(merged.values(),),
    };
  }

  // extend: add new templates, user wins on name conflict
  const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();
  for (const t of base.templates) {
    merged.set(t.name.toLowerCase(), t,);
  }
  const overrideTemplates = override.templates ?? [];
  for (const t of overrideTemplates) {
    merged.set(t.name.toLowerCase(), t,);
  }
  return {
    ...base,
    ...override,
    merge: base.merge,
    templates: Array.from(merged.values(),),
  };
}
// ── Validation ────────────────────────────────────────────────

const LEGAL_MERGE_STRATEGIES: readonly MergeStrategy[] = [
  "replace",
  "extend",
  "override",
];

/**
 * Runtime-validate a raw template config (from YAML/TOML) before merging,
 * so malformed files fail fast with an actionable error instead of silently
 * casting into a half-shaped config. Currently scoped to the `llm` domain.
 *
 * @param raw - Parsed top-level object from the template file
 * @returns The llm sub-object, or null when the file is a different domain
 * @throws When the file declares `merge` legally but `systemPrompts` /
 *   `chatFormats` shapes are malformed
 */
function validateLlmConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> | null {
  const llm = raw;
  if (!("systemPrompts" in llm) && !("chatFormats" in llm) && !("merge" in llm)) {
    return null;
  }

  if (llm.merge !== undefined) {
    if (
      typeof llm.merge !== "string" ||
      !LEGAL_MERGE_STRATEGIES.includes(llm.merge as MergeStrategy,)
    ) {
      throw new Error(
        `merge must be one of ${LEGAL_MERGE_STRATEGIES.join("|",)}, got ${JSON.stringify(llm.merge,)}`,
      );
    }
  }

  if (llm.systemPrompts !== undefined) {
    if (typeof llm.systemPrompts !== "object" || llm.systemPrompts === null) {
      throw new Error("systemPrompts must be an object mapping purpose -> string",);
    }
    for (
      const [purpose, value,] of Object.entries(
        llm.systemPrompts as Record<string, unknown>,
      )
    ) {
      if (typeof value !== "string") {
        throw new Error(
          `systemPrompts.${purpose} must be a string, got ${typeof value}`,
        );
      }
    }
  }

  if (llm.chatFormats !== undefined) {
    if (typeof llm.chatFormats !== "object" || llm.chatFormats === null) {
      throw new Error("chatFormats must be an object mapping name -> {system,user,assistant}",);
    }
    for (
      const [name, value,] of Object.entries(
        llm.chatFormats as Record<string, unknown>,
      )
    ) {
      if (typeof value !== "object" || value === null) {
        throw new Error(`chatFormats.${name} must be an object`,);
      }
      const fmt = value as Partial<ChatFormatTemplate>;
      for (const role of ["system", "user", "assistant",] as const) {
        if (typeof fmt[role] !== "string") {
          throw new Error(`chatFormats.${name}.${role} must be a string`,);
        }
      }
    }
  }

  return llm;
}

/**
 * Load template configuration from configs/templates/ directory.
 *
 * Merges user-provided template files with built-in defaults
 * using per-domain merge strategies.
 *
 * Also loads character files from configs/characters/ directory.
 *
 * @param cwd - Working directory to search from (default: process.cwd())
 * @returns Merged template configuration
 */
export function loadTemplateConfig(cwd?: string,): TemplatesConfig {
  const directory = cwd ?? process.cwd();
  const templateFiles = findTemplateFiles(directory,);

  const config: TemplatesConfig = structuredClone(TEMPLATES_DEFAULTS,);

  // Load character files from configs/characters/ directory
  const characterFiles = loadCharacterFiles(directory,);
  if (characterFiles.length > 0) {
    config.character.templates = characterFiles;
  }

  // Process each found template file
  for (const [domain, filePath,] of templateFiles) {
    try {
      const raw = parseTemplateFile(filePath,);
      const strategy = (raw.merge as MergeStrategy) ?? "extend";

      switch (domain) {
        case "llm": {
          // Fail fast on malformed llm config before merging.
          validateLlmConfig(raw,);
          config.llm = mergeLlmConfig(
            config.llm,
            raw as Partial<LlmTemplateConfig>,
            strategy,
          );
          break;
        }
        case "sd": {
          config.sd = mergeSdConfig(
            config.sd,
            raw as Partial<SdTemplateConfig>,
            strategy,
          );
          break;
        }
        case "avatar": {
          config.avatar = mergeAvatarConfig(
            config.avatar,
            raw as Partial<AvatarTemplateConfig>,
            strategy,
          );
          break;
        }
        case "imageEdit": {
          config.imageEdit = mergeImageEditConfig(
            config.imageEdit,
            raw as Partial<ImageEditTemplateConfig>,
            strategy,
          );
          break;
        }
        case "character": {
          config.character = mergeCharacterConfig(
            config.character,
            raw as Partial<CharacterTemplateConfig>,
            strategy,
          );
          break;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to load template config ${filePath}: ${(error as Error).message}`,
        { cause: error, },
      );
    }
  }

  return config;
}

export {
  findMainRepoRoot,
  findTemplateFiles,
  mergeAvatarConfig,
  mergeCharacterConfig,
  mergeImageEditConfig,
  mergeLlmConfig,
  mergeSdConfig,
  TEMPLATE_FILES,
};
