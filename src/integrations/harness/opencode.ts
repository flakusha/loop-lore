// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * opencode.ts — opencode's {@link HarnessAcpAdapter} (harness-specific).
 *
 * `opencode acp` serves stable ACP v1: session/new advertises a select
 * config option with id `"model"` whose values are `providerID/modelID`
 * strings (packages/opencode/src/acp/config-option.ts), and
 * `session/set_config_option` accepts the same shape. Those values already
 * match the core's `provider/id` model ids, so no translation happens.
 * opencode has no quota surface over ACP, so fetchUsageReports resolves
 * null (the generic engine's default).
 */

import { type HarnessAcpAdapter, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Config option id opencode uses for its model select. */
const MODEL_CONFIG_ID = "model";

/** The opencode adapter: `model` select, `provider/id` ids, no quota. */
export class OpenCodeAcpAdapter extends GenericAcpAdapter {
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
 * Factory the ProfileRegistry uses for opencode profiles.
 * @param _profile - profile name (unused; argv carries opencode's flags)
 * @param command - the profile's spawn argv (e.g. `["opencode", "acp"]`)
 * @returns the opencode adapter.
 */
export function createOpenCodeAdapter(_profile: string, command: string[],): HarnessAcpAdapter {
  return new OpenCodeAcpAdapter({ command, },);
}
