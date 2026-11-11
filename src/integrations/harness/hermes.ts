// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * hermes.ts — the Hermes Agent ACP adapter (`hermes acp`, NousResearch/
 * hermes-agent), harness-specific.
 *
 * Wire facts (upstream sources, verified 2026-11-11):
 *
 * - Docs: https://hermes-agent.nousresearch.com/docs/user-guide/features/acp
 *   (launch: `hermes acp` / `hermes-acp`; `hermes acp --version` probe) and
 *   https://hermes-agent.nousresearch.com/docs/developer-guide/acp-internals.
 * - Model surface: session responses carry the `models` field
 *   (SessionModelState: `availableModels: [{modelId, name, description}]` +
 *   `currentModelId`) instead of a stable configOption select —
 *   acp_adapter/server.py `_session_response_fields` →
 *   `"models": self._build_model_state(state)` (main, 2026-11). Same JSON
 *   shape claude-agent-acp serves, so the generic engine's `models`-field
 *   model hook is shared verbatim.
 * - Model ids: `provider:model` (colon) — model_catalog.py
 *   `encode_model_choice(provider, model)`; named OpenAI-compatible endpoints
 *   use `custom:<name>:<model>`. The core's contract expects `provider/id`,
 *   so this adapter swaps the FIRST colon for a slash on enumerate and the
 *   reverse on set (`openrouter:z-ai/glm-5.1` ↔ `openrouter/z-ai/glm-5.1`;
 *   `custom:<name>:<model>` ↔ `custom/<name>:<model>`); values with no colon
 *   (already slash-shaped or bare) pass through verbatim in both directions.
 * - Switching: the `set_session_model` agent method (server.py:1084), an
 *   UNSTABLE protocol route (hermes boots the Python SDK with
 *   `use_unstable_protocol=True`; the Python SDK shipped it unstable —
 *   removed from the stable dispatch in agent-client-protocol 0.11.0,
 *   upstream issue harbor-framework/harbor#2206; hermes issue #80150 names
 *   the method). Wire method `session/set_session_model` with
 *   `{sessionId, modelId}` (camelCase JSON keys, mirroring the claude-agent-acp
 *   ext-method precedent). Hermes' `session/set_config_option` deliberately
 *   does NOT switch models (it stores generic options; server.py:1136-1155),
 *   so the generic-engine default would silently no-op — the override below
 *   is required for the switch to take effect.
 * - Quota: no requestable quota surface over ACP (best-effort `usage_update`
 *   notifications only) → fetchUsageReports resolves null (engine default).
 *
 * ToS classification: `{api, local}`, ungated — hermes runs on the operator's
 * own provider credentials configured inside Hermes itself (see
 * provider-tos.ts for the citation).
 */

import { type HarnessAcpAdapter, type HarnessAdapterCommandOptions, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Unstable ACP method Hermes answers session model switches with (verified casing: snake method, camelCase params). */
const SET_MODEL_METHOD = "session/set_session_model";

/** The `models` session field as hermes' ACP adapter returns it. */
interface SessionModelStateShape {
  models?: {
    availableModels?: Array<{ modelId?: unknown }> | null;
  } | null;
}

/** The hermes adapter: `models` field + `session/set_session_model`, colon→slash ids, no quota. */
export class HermesAcpAdapter extends GenericAcpAdapter {
  /** Unused — both default model hooks are overridden below. */
  protected readonly modelConfigId = "model";

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   *   first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: GenericAcpOptions,) {
    super(options,);
  }

  /**
   * Read the non-standard `models` session field (same shape as claude-agent-acp).
   */
  protected override advertisedModelIds(session: { sessionId: string; options: unknown },): string[] {
    const models = (session.options as SessionModelStateShape | null)?.models?.availableModels ?? [];
    return models.map((m,) => String(m.modelId ?? "",));
  }

  /**
   * Switch via the unstable `session/set_session_model` method.
   */
  protected override async applySessionModel(sessionId: string, wireModelId: string,): Promise<void> {
    await this.rpc!.request(SET_MODEL_METHOD, { sessionId, modelId: wireModelId, },);
  }

  /**
   * Core-facing id: first `:` becomes `/` (`provider:model` → `provider/model`,
   * `custom:<name>:<model>` → `custom/<name>:<model>`); colon-free values pass verbatim.
   */
  protected override toCoreModelId(wireModelId: string,): string {
    const colon = wireModelId.indexOf(":",);
    if (colon <= 0 || colon === wireModelId.length - 1) { return wireModelId; }

    return `${wireModelId.slice(0, colon,)}/${wireModelId.slice(colon + 1,)}`;
  }

  /**
   * Wire id: the first `/` (before any later slash) becomes `:`; slash-free values pass verbatim.
   */
  protected override toWireModelId(modelId: string,): string {
    const slash = modelId.indexOf("/",);
    if (slash <= 0 || slash === modelId.length - 1) { return modelId; }

    return `${modelId.slice(0, slash,)}:${modelId.slice(slash + 1,)}`;
  }
}

/**
 * Factory the ProfileRegistry uses for hermes profiles.
 * @param _profile - profile name (unused; argv carries `hermes acp`)
 * @param command - the profile's spawn argv (e.g. `["hermes", "acp"]`)
 * @returns the hermes adapter.
 */
export function createHermesAdapter(
  _profile: string,
  command: string[],
  options?: HarnessAdapterCommandOptions,
): HarnessAcpAdapter {
  return new HermesAcpAdapter({ command, ...options, },);
}
