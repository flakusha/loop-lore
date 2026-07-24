// src/config/templates-loader.ts — Template config file loader
//
// Finds and loads template config files (YAML or TOML) from configs/templates/ directory.
// YAML takes priority over TOML (if both exist, YAML wins).
// Applies per-domain merge strategies (replace, extend, override).

import { load as parseYaml, } from "js-yaml";
import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { parse as parseToml, } from "smol-toml";
import type {
  AvatarTemplateConfig,
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

  // extend: add new emotions/patterns, config wins on conflict
  return {
    ...base,
    ...override,
    merge: base.merge,
    emotions: { ...base.emotions, ...override.emotions, },
    intentPatterns: [
      ...base.intentPatterns,
      ...(override.intentPatterns ?? []),
    ],
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

// ── Main Loader ─────────────────────────────────────────────

/**
 * Load template configuration from configs/templates/ directory.
 *
 * Merges user-provided template files with built-in defaults
 * using per-domain merge strategies.
 *
 * @param cwd - Working directory to search from (default: process.cwd())
 * @returns Merged template configuration
 */
export function loadTemplateConfig(cwd?: string,): TemplatesConfig {
  const directory = cwd ?? process.cwd();
  const templateFiles = findTemplateFiles(directory,);

  let config: TemplatesConfig = structuredClone(TEMPLATES_DEFAULTS,);

  // Process each found template file
  for (const [domain, filePath,] of templateFiles) {
    try {
      const raw = parseTemplateFile(filePath,);
      const strategy = (raw.merge as MergeStrategy) ?? "extend";

      switch (domain) {
        case "llm":
          config.llm = mergeLlmConfig(
            config.llm,
            raw as Partial<LlmTemplateConfig>,
            strategy,
          );
          break;
        case "sd":
          config.sd = mergeSdConfig(
            config.sd,
            raw as Partial<SdTemplateConfig>,
            strategy,
          );
          break;
        case "avatar":
          config.avatar = mergeAvatarConfig(
            config.avatar,
            raw as Partial<AvatarTemplateConfig>,
            strategy,
          );
          break;
        case "imageEdit":
          config.imageEdit = mergeImageEditConfig(
            config.imageEdit,
            raw as Partial<ImageEditTemplateConfig>,
            strategy,
          );
          break;
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
  mergeImageEditConfig,
  mergeLlmConfig,
  mergeSdConfig,
  TEMPLATE_FILES,
};
