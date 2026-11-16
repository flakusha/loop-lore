// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Centralized runtime paths. Single source of truth — import from here, not hardcoded. */
import pkg from "../../package.json" with { type: "json", };
import { resolveInstanceDir, } from "./state-dir";

/**
 * Per-instance XDG state dir ($XDG_STATE_HOME/loop-lore/<instance>, fallback
 * ~/.local/state/loop-lore/<instance>) — see ./state-dir.ts for precedence.
 *
 * Frozen at first import: production sets LOOP_LORE_INSTANCE/PORT before
 * boot, so import-time freezing is correct there. Code that must react to a
 * changed environment at runtime (getDatabase, liveDbPath) re-resolves via
 * resolveDbPath() instead of reading this. Explicit path env
 * (LOOP_LORE_DB_PATH, ASSETS_UPLOAD_DIR, …) always wins over this default.
 */
export const DATA_DIR = resolveInstanceDir();

/**
 * Cache-Control max-age for immutable static assets (1 year in seconds).
 * Used for hashed filenames, compressed variants, and other cache-safe resources.
 */
export const IMMUTABLE_CACHE_MAX_AGE = 31_536_000;

/**
 * Application identity. Imported from package.json so the version stays in
 * one place — `package.json` is the source of truth, not duplicated literals.
 */
export const APP_NAME: string = pkg.name;
export const APP_VERSION: string = pkg.version;
