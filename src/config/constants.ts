// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Centralized runtime paths. Single source of truth — import from here, not hardcoded. */
import pkg from "../../package.json" with { type: "json" };
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve DATA_DIR relative to this file's location, not CWD */
export const DATA_DIR = path.resolve(__dirname, "..", "..", "loop-lore-data");

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
