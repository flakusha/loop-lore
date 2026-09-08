// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, readdirSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { findMainRepoRoot, } from "../../utils/git-worktree";
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

// ── Workflow Directory Discovery ─────────────────────────────
//
// Assistant workflow templates are multi-file: every
// `configs/templates/workflows/*.yaml` (or *.yml) file contributes one or
// more workflows keyed by id. Unlike single-file domains, all matching files
// are returned (not first-match-wins) so user overrides layer over defaults.

/** Workflow file extensions (YAML only — workflows have no TOML shape) */
const WORKFLOW_EXTENSIONS = [".yaml", ".yml",] as const;

/**
 * Find assistant workflow template files across search directories.
 * Returns every matching file (defaults + overrides); callers merge in order.
 * @param cwd - Working directory to search from
 */
export function findWorkflowFiles(cwd: string,): string[] {
  const mainRoot = findMainRepoRoot(cwd,);
  const searchDirs = [
    path.join(cwd, "configs", "templates", "workflows",),
    path.join(cwd, "templates", "workflows",),
  ];
  if (mainRoot && mainRoot !== cwd) {
    searchDirs.push(
      path.join(mainRoot, "configs", "templates", "workflows",),
      path.join(mainRoot, "templates", "workflows",),
    );
  }
  const found: string[] = [];
  const seen: Record<string, true> = {};
  for (const dir of searchDirs) {
    if (!existsSync(dir,) || !statSync(dir,).isDirectory()) { continue; }
    for (const name of readdirSync(dir,).sort()) {
      if (!WORKFLOW_EXTENSIONS.some((ext,) => name.endsWith(ext,))) { continue; }
      const fullPath = path.join(dir, name,);
      if (seen[fullPath]) { continue; }
      seen[fullPath] = true;
      found.push(fullPath,);
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
