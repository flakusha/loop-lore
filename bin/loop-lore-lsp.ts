#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * bin/loop-lore-lsp.ts — spawnable stdio LSP server for stock editor configs.
 *
 * Editors run `loop-lore-lsp --stdio`. The `--stdio` flag is accepted for
 * client-config compatibility (Content-Length-framed stdio is the only
 * transport); auth rides `initializationOptions.token`, never argv.
 */
import { main, } from "../src/integrations/lsp/stdio-server";

if (import.meta.main) {
  void main();
}
