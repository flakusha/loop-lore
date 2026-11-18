// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * antigravity.ts — Google Antigravity CLI's {@link HarnessAcpAdapter} (harness-specific).
 *
 * `agy acp` serves ACP (antigravity.google/docs/cli/acp). The model select
 * follows the ACP-v1 `model` config-option convention shared by opencode and
 * codex; values pass through verbatim (Antigravity advertises
 * `provider/id`-shaped ids, so Gemini arrives as `google/gemini-*`). If a
 * future `agy` release renames the option, enumerateModels degrades to [] and
 * setModel fails with a typed `model` error — probe, don't guess: verify with
 * a live `agy` before changing this id.
 */

import { type HarnessAcpAdapter, type HarnessAdapterCommandOptions, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Config option id the ACP-v1 `model` select convention uses. */
const MODEL_CONFIG_ID = "model";

/** The Antigravity adapter: `model` select, verbatim ids, no quota. */
export class AntigravityAcpAdapter extends GenericAcpAdapter {
  protected readonly modelConfigId = MODEL_CONFIG_ID;

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
