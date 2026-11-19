// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * antigravity.ts — Google Antigravity CLI's {@link HarnessAcpAdapter} (harness-specific).
 *
 * `agy acp` serves stable ACP v1 with a `model` config option. Live agy 1.5.11
 * advertises BARE ids (`gemini-3.8-flash`, `claude-sonnet-4-6`,
 * `gpt-oss-120b-medium`) — no `provider/` prefix. Core ids must be
 * `provider/id`, so bare ids are namespaced with `antigravity/` and stripped
 * again on the way back to `session/set_config_option` (mirroring claude-code).
 * If a future `agy` release renames the option, enumerateModels degrades to []
 * and setModel fails with a typed `model` error — probe, don't guess.
 */

import { type HarnessAcpAdapter, type HarnessAdapterCommandOptions, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Config option id the ACP-v1 `model` select convention uses. */
const MODEL_CONFIG_ID = "model";

/** Namespace prefixed to bare agy ids so core-facing ids stay `provider/id`. */
const PROVIDER_PREFIX = "antigravity/";

/** The Antigravity adapter: `model` select, verbatim ids, no quota. */
export class AntigravityAcpAdapter extends GenericAcpAdapter {
  protected readonly modelConfigId = MODEL_CONFIG_ID;

  /**
   * Namespace bare agy ids; slash-containing wire values pass verbatim.
   */
  protected override toCoreModelId(wireModelId: string,): string {
    return wireModelId.includes("/",) ? wireModelId : `${PROVIDER_PREFIX}${wireModelId}`;
  }

  /**
   * Strip the `antigravity/` namespace; anything else passes verbatim.
   */
  protected override toWireModelId(modelId: string,): string {
    return modelId.startsWith(PROVIDER_PREFIX,) ? modelId.slice(PROVIDER_PREFIX.length,) : modelId;
  }

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   * first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: GenericAcpOptions,) {
    super(options,);
  }
}

/**
 * Factory the ProfileRegistry uses for antigravity profiles.
 * @param _profile - profile name (unused; argv carries agy's flags)
 * @param command - the profile's spawn argv (e.g. `["agy", "acp"]`)
 * @returns the antigravity adapter.
 */
export function createAntigravityAdapter(
  _profile: string,
  command: string[],
  options?: HarnessAdapterCommandOptions,
): HarnessAcpAdapter {
  return new AntigravityAcpAdapter({ command, ...options, },);
}
