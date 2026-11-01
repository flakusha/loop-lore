// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * codex.ts — the Codex CLI ACP agent's {@link HarnessAcpAdapter}
 * (harness-specific; zed-industries/codex-acp).
 *
 * The agent serves stable ACP v1: session/new advertises a select config
 * option with id `"model"` whose values are bare model-preset ids
 * (`gpt-5.1-codex` — no provider prefix), and `session/set_config_option`
 * switches it. The core's contract expects `provider/id` model ids, so this
 * adapter namespaces bare wire values as `codex/<preset>` on enumerate and
 * strips the namespace on set; wire values that already contain a `/` pass
 * through verbatim in both directions. Codex publishes no provider-quota
 * surface over ACP (its usage notification reports context-window fill, not
 * quota), so fetchUsageReports resolves null.
 */

import { type HarnessAcpAdapter, type HarnessAdapterCommandOptions, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Config option id the Codex ACP agent uses for its model select. */
const MODEL_CONFIG_ID = "model";

/** Namespace prefixed to bare preset ids so core-facing ids stay `provider/id`. */
const PROVIDER_PREFIX = "codex/";

/** The codex adapter: `model` select with bare preset ids, no quota. */
export class CodexAcpAdapter extends GenericAcpAdapter {
  protected readonly modelConfigId = MODEL_CONFIG_ID;

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   * first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: GenericAcpOptions,) {
    super(options,);
  }

  /**
   * Namespace bare preset ids; slash-containing wire values pass verbatim.
   */
  protected override toCoreModelId(wireModelId: string,): string {
    return wireModelId.includes("/",) ? wireModelId : `${PROVIDER_PREFIX}${wireModelId}`;
  }

  /**
   * Strip the `codex/` namespace; anything else passes verbatim.
   */
  protected override toWireModelId(modelId: string,): string {
    return modelId.startsWith(PROVIDER_PREFIX,) ? modelId.slice(PROVIDER_PREFIX.length,) : modelId;
  }
}

/**
 * Factory the ProfileRegistry uses for codex profiles.
 * @param _profile - profile name (unused; argv carries codex's flags)
 * @param command - the profile's spawn argv (e.g. `["codex-acp"]`)
 * @returns the codex adapter.
 */
export function createCodexAdapter(
  _profile: string,
  command: string[],
  options?: HarnessAdapterCommandOptions,
): HarnessAcpAdapter {
  return new CodexAcpAdapter({ command, ...options, },);
}
