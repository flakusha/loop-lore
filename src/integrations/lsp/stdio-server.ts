// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * inbound editor-LSP server — stdio Content-Length-framed JSON-RPC (first
 * slice: initialize/shutdown, didOpen/didChange tracking, single-item
 * `textDocument/completion`).
 *
 * This module owns production wiring only: load config, open the database,
 * serve LSP over stdio. The handler graph lives in handler.ts (with the
 * protocol.ts, prompt.ts, documents.ts, and completion.ts seams); an editor
 * spawns this file with a stock LSP client config. Deferred:
 * completionItem/resolve, inlineCompletion, codeAction/chat, per-editor
 * plugins.
 */

import { loadConfig, } from "../../config/load";
import type { Config, } from "../../config/schema";
import { getDatabase, } from "../../db/index";
import { createLogger, getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import {
  applyStoredHarnessSettings,
  initHarnessAdminSettings,
} from "../harness/admin-settings";
import { getHarnessRuntime, initHarnessRuntime, } from "../harness/runtime";
import { createLspMessageHandler, } from "./handler";
import { createLspFrameParser, } from "./protocol";

/**
 * Production entrypoint: load config, open the database, serve LSP over
 * stdio with Content-Length framing. Exits 1 with a stderr diagnostic when
 * the harness runtime is disabled — and NEVER serves completions
 * unauthenticated (every `initialize` needs a token).
 */
export async function main(): Promise<void> {
  createLogger();
  const config: Config = loadConfig();
  const harnessAcp = config.harness?.acp ?? { enabled: false, profiles: [], };
  initHarnessAdminSettings(harnessAcp,);
  initHarnessRuntime(harnessAcp,);

  const database = getDatabase();
  await applyStoredHarnessSettings(database,);

  const runtime = getHarnessRuntime();
  const logger = getLogger();
  if (runtime === null) {
    logger.warn(
      "inbound LSP stdio server refused to start: harness.acp is disabled or unconfigured",
      { module: "lsp-inbound", },
    );

    process.exitCode = 1;
    return;
  }

  const write = (message: unknown,): void => {
    const serialized = safeJsonStringify(message,);
    if (!serialized.ok) { return; }
    const length = Buffer.byteLength(serialized.value,);
    process.stdout.write(`Content-Length: ${length}\r\n\r\n${serialized.value}`,);
  };

  const handler = createLspMessageHandler({ database, runtime, }, write,);
  const feed = createLspFrameParser((text,) => {
    void handler(text,).catch((error: unknown,) => {
      // A rejected message must never surface as an unhandled rejection.
      logger.error(
        "inbound LSP message handler failed",
        error instanceof Error ? error : undefined,
        { module: "lsp-inbound", },
      );
    },);
  },);

  process.stdin.on("data", feed,);
  // A close without the `exit` notification is abnormal — `exit` already
  // ends the process first on the clean path.
  process.stdin.on("end", () => {
    process.exit(1,);
  },);

  logger.info("inbound LSP stdio server ready", { module: "lsp-inbound", },);
}

if (import.meta.main) {
  void main();
}
