// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Effective llama-swap auto-start settings: file config overlaid by the
 * admin's `system_config` overrides. One resolver for the boot auto-starter,
 * the admin status surface and the render-time unload port, so a PATCH cannot
 * diverge from what the runtime actually uses.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../admin/config";
import type { DB, } from "../db/schema";

/** Source-of-truth keys in `system_config` (mirrors LlamaSwapAutoStartConfig). */
export const LLAMA_SWAP_AUTOSTART_ENABLED_KEY = "generation.autoStart.llamaSwap.enabled";
/** `system_config` key for the proxy config path override. */
export const LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY = "generation.autoStart.llamaSwap.configPath";
/** `system_config` key for the proxy listen-port override. */
export const LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY = "generation.autoStart.llamaSwap.listenPort";

/** Effective llama-swap settings consumed at boot and at render time. */
export interface LlamaSwapEffectiveConfig {
  enabled: boolean;
  configPath: string;
  listenPort?: number;
}

/** @param raw - stored boolean value; malformed values fall through to file config. */
function parseBoolean(raw: string | undefined,): boolean | undefined {
  if (raw === "true") { return true; }
  if (raw === "false") { return false; }
  return undefined;
}

/** @param raw - stored port value; malformed values fall through to file config. */
function parsePort(raw: string | undefined,): number | undefined {
  if (raw === undefined) { return undefined; }
  const port = Number(raw,);
  return Number.isInteger(port,) && port >= 1 && port <= 65535 ? port : undefined;
}

/**
 * Resolve file config with any stored overrides applied.
 * @param database - database holding `system_config`
 * @param file - loaded `generation.autoStart.llamaSwap`, if configured
 * @returns the effective settings, or undefined when nothing is configured
 */
export async function readEffectiveLlamaSwapConfig(
  database: Kysely<DB>,
  file?: LlamaSwapEffectiveConfig,
): Promise<LlamaSwapEffectiveConfig | undefined> {
  const enabledRaw = await getConfigValue(database, LLAMA_SWAP_AUTOSTART_ENABLED_KEY,);
  const portRaw = await getConfigValue(database, LLAMA_SWAP_AUTOSTART_LISTEN_PORT_KEY,);
  const pathRaw = await getConfigValue(database, LLAMA_SWAP_AUTOSTART_CONFIG_PATH_KEY,);

  const enabled = parseBoolean(enabledRaw,) ?? file?.enabled;
  const configPath = pathRaw?.trim() || file?.configPath.trim() || "";
  const listenPort = parsePort(portRaw,) ?? file?.listenPort;
  if (enabled === undefined && configPath === "" && listenPort === undefined) { return undefined; }
  return { enabled: enabled ?? false, configPath, ...(listenPort === undefined ? {} : { listenPort, }), };
}
