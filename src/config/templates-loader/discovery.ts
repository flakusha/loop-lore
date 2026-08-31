// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import type { TemplatesConfig, } from "../sections/templates";

// ── File Discovery ──────────────────────────────────────────

/** Template file names mapped to domain keys. YAML before TOML (YAML wins). */
export const TEMPLATE_FILES: Record<string, keyof TemplatesConfig> = {
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
 * @param cwd
 */
export function findMainRepoRoot(cwd: string,): string | null {
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

/**
 * Find template files in search directories
 * @param cwd
 */
export function findTemplateFiles(cwd: string,): Map<string, string> {
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

/**
 * @param filePath
 */
export function parseTemplateFile(filePath: string,): Record<string, unknown> {
  const content = readFileSync(filePath, "utf8",);
  const ext = path.extname(filePath,).slice(1,);
  if (ext === "toml") {
    return Bun.TOML.parse(content,) as Record<string, unknown>;
  }
  return Bun.YAML.parse(content,) as Record<string, unknown>;
}
