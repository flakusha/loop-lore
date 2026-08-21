// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import type { ExpansionConfig, } from "./types.js";

// ── File Discovery ─────────────────────────────────────────

/** Expansion file names */
const EXPANSION_FILES = [
  "expansion.yaml",
  "expansion.yml",
  "expansion.toml",
];

/**
 * Find expansion config file in search directories.
 */
export function findExpansionFile(cwd: string,): string | null {
  const searchDirs = [
    path.join(cwd, "configs", "templates",),
    path.join(cwd, "templates",),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir,) || !statSync(dir,).isDirectory()) { continue; }

    for (const filename of EXPANSION_FILES) {
      const fullPath = path.join(dir, filename,);
      if (existsSync(fullPath,)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Parse expansion config file (YAML or TOML).
 */
export function parseExpansionFile(filePath: string,): ExpansionConfig {
  const content = readFileSync(filePath, "utf8",);
  const ext = path.extname(filePath,).slice(1,);

  if (ext === "toml") {
    return Bun.TOML.parse(content,) as unknown as ExpansionConfig;
  }
  return Bun.YAML.parse(content,) as ExpansionConfig;
}
