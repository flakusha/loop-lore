// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * claude-code.ts — the claude-agent-acp adapter
 * (@agentclientprotocol/claude-agent-acp, harness-specific).
 *
 * The agent does NOT serve model selection through stable ACP v1
 * configOptions (the split-out reason recorded in
 * TASK-acp-claude-code-adapter). Verified wire surface:
 *
 * - session/new carries a non-standard `models` field
 *   (SessionModelState: `availableModels: [{modelId, name, description}]` +
 *   `currentModelId`) instead of a select configOption;
 * - switching goes through the `unstable_setSessionModel` extension method
 *   with `{sessionId, modelId}` (SDK `query.setModel`);
 * - model ids are bare Anthropic strings (e.g. `claude-opus-4-6`).
 *
 * The generic engine's two model hooks (advertisedModelIds /
 * applySessionModel) absorb both differences; the `claude/` namespace keeps
 * core-facing ids in the `provider/id` shape (mirroring codex). No quota
 * surface over ACP → fetchUsageReports resolves null.
 */

import { type HarnessAcpAdapter, } from "./adapter-types";
import { GenericAcpAdapter, type GenericAcpOptions, } from "./generic-acp";

/** Ext method claude-agent-acp answers model switches with (unstable name, verified casing). */
const SET_MODEL_METHOD = "unstable_setSessionModel";

/** Namespace prefixed to bare Anthropic ids so core-facing ids stay `provider/id`. */
const PROVIDER_PREFIX = "claude/";

/** The `models` session field as claude-agent-acp returns it. */
interface SessionModelStateShape {
  models?: {
    availableModels?: Array<{ modelId?: unknown }> | null;
  } | null;
}

/** The claude-code adapter: `models` field + unstable_setSessionModel, no quota. */
export class ClaudeCodeAcpAdapter extends GenericAcpAdapter {
  /** Unused — both default model hooks are overridden below. */
  protected readonly modelConfigId = "model";

  /**
   * @param options - spawn argv + cwd; the handshake happens lazily on the
   * first adapter call so a missing binary surfaces as a typed probe failure.
   */
  constructor(options: GenericAcpOptions,) {
    super(options,);
  }

  /**
   * Read the non-standard `models` session field.
   */
  protected override advertisedModelIds(session: { sessionId: string; options: unknown },): string[] {
    const models = (session.options as SessionModelStateShape | null)?.models?.availableModels ?? [];
    return models.map((m,) => String(m.modelId ?? "",));
  }

  /**
   * Switch via the unstable extension method.
   */
  protected override async applySessionModel(sessionId: string, wireModelId: string,): Promise<void> {
    await this.rpc!.request(SET_MODEL_METHOD, { sessionId, modelId: wireModelId, },);
  }

  /**
   * Namespace bare Anthropic ids; slash-containing wire values pass verbatim.
   */
  protected override toCoreModelId(wireModelId: string,): string {
    return wireModelId.includes("/",) ? wireModelId : `${PROVIDER_PREFIX}${wireModelId}`;
  }

  /**
   * Strip the `claude/` namespace; anything else passes verbatim.
   */
  protected override toWireModelId(modelId: string,): string {
    return modelId.startsWith(PROVIDER_PREFIX,) ? modelId.slice(PROVIDER_PREFIX.length,) : modelId;
  }
}

/**
 * Factory the ProfileRegistry uses for claude-code profiles.
 * @param _profile - profile name (unused; argv carries the adapter's flags)
 * @param command - the profile's spawn argv (e.g. `["claude-agent-acp"]`)
 * @returns the claude-code adapter.
 */
export function createClaudeCodeAdapter(_profile: string, command: string[],): HarnessAcpAdapter {
  return new ClaudeCodeAcpAdapter({ command, },);
}
