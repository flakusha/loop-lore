// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * openclaw.ts — the OpenClaw ACP bridge adapter (`openclaw acp`),
 * harness-specific.
 *
 * Wire facts (upstream doc, verified 2026-11-11):
 * https://docs.openclaw.ai/cli/acp — `openclaw acp` is a Gateway-backed ACP
 * bridge over stdio: it implements initialize/session-new/prompt/cancel
 * (plus list/resume/close) and streams assistant text as append-only
 * `agent_message_chunk` updates. Its compatibility matrix states
 * explicitly: "Model selection and exec-host controls are not exposed as
 * ACP config options", and per-session MCP servers are rejected. Usage
 * arrives as best-effort `usage_update` notifications only (approximate,
 * no cost data) — there is no requestable quota surface.
 *
 * Consequences, strictly doc-proven (no other flavor-specific overrides):
 *
 * - `advertisedModelIds` → `[]`: no model listing exists; discovery degrades
 *   to the profile's static tier config (model-discovery.ts).
 * - `applySessionModel` → no-op: there is nothing to switch. The profile's
 *   tier models stay loop-lore-side labels (config validation still requires
 *   a concrete `provider/id` model per tier); the dispatch path's
 *   `setModel` call succeeds without a wire round-trip instead of erroring
 *   against a config-option surface the bridge does not serve.
 * - No quota override → fetchUsageReports resolves null (engine default).
 *
 * ToS classification: `{api, local}`, ungated — provider credentials live on
 * the Gateway/host, not a subscription tier (see provider-tos.ts).
 */

import { type HarnessAcpAdapter, type HarnessAdapterCommandOptions, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** The openclaw adapter: no model surface, no quota — prompts and transcripts only. */
export class OpenClawAcpAdapter extends GenericAcpAdapter {
  /** Unused — the model hooks are overridden below. */
  protected readonly modelConfigId = "model";

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   *   first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: GenericAcpOptions,) {
    super(options,);
  }

  /**
   * The bridge exposes no model selection over ACP — always an empty listing.
   */
  protected override advertisedModelIds(_session: { sessionId: string; options: unknown },): string[] {
    return [];
  }

  /**
   * Nothing to apply: model selection is not an ACP config option on this
   * bridge. A no-op keeps the dispatch path's `setModel` contract working
   * without sending a request the bridge would have to reject or ignore.
   */
  protected override async applySessionModel(_sessionId: string, _wireModelId: string,): Promise<void> {
    return;
  }
}

/**
 * Factory the ProfileRegistry uses for openclaw profiles.
 * @param _profile - profile name (unused; argv carries `openclaw acp`)
 * @param command - the profile's spawn argv (e.g. `["openclaw", "acp"]`)
 * @returns the openclaw adapter.
 */
export function createOpenClawAdapter(
  _profile: string,
  command: string[],
  options?: HarnessAdapterCommandOptions,
): HarnessAcpAdapter {
  return new OpenClawAcpAdapter({ command, ...options, },);
}
