// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Native BLAKE3 Plugin — core plugin wrapping the pre-compiled hot binary
 * sample.
 *
 * Registers a health probe (`GET /api/native/blake3/health`) exposing which
 * implementation is active (Rust cdylib vs pure-TS fallback) and the native
 * module status. This is the *integration sample* for pre-compiled code:
 * the actual hashing lives in `src/native/`, this plugin demonstrates how a
 * plugin consumes the native layer and degrades gracefully when the binary
 * is unavailable (no Rust toolchain at build time, unsupported platform).
 *
 * License: Apache-2.0 OR MIT (mirrors the Rust crate)
 */

import type { PluginManifest } from "../../../src/plugins/types";
import { handleBlake3Health } from "./routes";

export const plugin: PluginManifest = {
  name: "native-blake3",
  version: "0.1.0",
  description: "BLAKE3 hashing via pre-compiled native module with pure-TS fallback (hot binary integration sample)",
  author: "loop-lore team",
  license: "Apache-2.0 OR MIT",

  async onLoad(context) {
    context.registerApiRoute({
      method: "GET",
      path: "/api/native/blake3/health",
      handler: handleBlake3Health,
    });
  },
};
