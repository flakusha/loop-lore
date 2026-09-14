// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bun test preload — resets the NSFW runtime config singleton before every
 * test file. Closes the cross-file pollution path when the suite runs without
 * `--isolate` (the module registry is shared across files).
 *
 * Wired in `bunfig.toml` under `[test] preload`. No-op under `--isolate`
 * (each file already gets a fresh module registry, so the reset is redundant
 * but harmless).
 */
import { beforeAll, } from "bun:test";
import { resetNsfwRuntimeConfig, } from "../nsfw/runtime-config";

beforeAll(() => {
  resetNsfwRuntimeConfig();
},);
