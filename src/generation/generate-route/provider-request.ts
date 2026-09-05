// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Route — provider request assembly.
 *
 * Builds the provider-request object from a resolved provider and
 * generation options. Extracted from handler.ts to keep that orchestrator
 * under the size gate.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { ResolvedProvider, } from "../providers/registry";
import type { GenerateRequest as ProviderRequest, } from "../providers/types";
import type { GenerationMessage, } from "../types";
import { gatePluginToolsByRole, } from "./tool-execution";
import type { GenerateRequest, } from "./types";

/**
 * Assemble the provider request for a resolved provider.
 *
 * Plugin-tool gating: if the generating actor has a plugin agent role
 * assigned, expose only the tools that role declares; otherwise expose all
 * registered plugin tools (lookup is best-effort — failures default to all).
 * @param opts
 */
export async function buildProviderRequest(opts: {
  input: GenerateRequest;
  resolved: ResolvedProvider;
  messages: GenerationMessage[];
  database: Kysely<DB>;
  abortSignal: AbortSignal;
  stream: boolean;
},): Promise<ProviderRequest> {
  const { input, resolved, messages, database, abortSignal, stream, } = opts;

  let roleRow: { agent_role: string | null } | undefined;
  try {
    roleRow = await database
      .selectFrom("actors",)
      .select(["agent_role",],)
      .where("id", "=", input.actorId,)
      .executeTakeFirst();
  } catch {
    // Role lookup is best-effort — default to exposing all plugin tools.
  }
  const pluginTools = gatePluginToolsByRole(roleRow?.agent_role ?? null,);

  const tools = pluginTools.length > 0
    ? Array.from(pluginTools, (t,) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description, parameters: t.parameters, },
    }),)
    : undefined;

  return {
    model: resolved.resolvedModel,
    messages,
    tools,
    apiKey: resolved.resolvedApiKey,
    params: {
      stream,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      topP: input.topP,
      stop: input.stop,
      minP: input.minP,
      topK: input.topK,
      typicalP: input.typicalP,
      repeatPenalty: input.repeatPenalty,
      dryMultiplier: input.dryMultiplier,
      xtcProbability: input.xtcProbability,
      dynatempRange: input.dynatempRange,
      reasoningBudget: input.reasoningBudget,
    },
    signal: abortSignal,
  };
}
