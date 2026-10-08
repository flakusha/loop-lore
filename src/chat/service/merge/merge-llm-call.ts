// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LLM provider invocation for content merges (FEA-2026-047). Extracted
 * from `merge-service.ts` to stay under the 250-line budget.
 */
import type { Kysely, } from "kysely";
import { resolveModelRole, } from "../../../admin/model-roles";
import type { Config, } from "../../../config/schema";
import { ModelRole, } from "../../../db/enums-core";
import type { DB, } from "../../../db/schema";
import { callWithFailover, } from "../../../generation/providers/call-with-failover";
import { buildFailoverList, resolveProvider, } from "../../../generation/providers/registry";
import type { GenerateRequest, } from "../../../generation/providers/types";
import { getLogger, } from "../../../logger";
import type { MergeError, } from "./merge-criteria";

/**
 * Call the LLM for a merge prompt. Resolves the main model role, provider,
 * and failover list, then dispatches through `callWithFailover`.
 * @param database
 * @param config
 * @param chatId
 * @param userId requesting actor — resolves their BYO provider key
 * @param messages
 * @returns {Promise<{ ok: true; content: string } | MergeError>}
 */
export async function callMergeLlm(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  userId: string,
  messages: { role: string; content: string }[],
): Promise<{ ok: true; content: string } | MergeError> {
  const log = getLogger().child({ module: "merge-llm-call", },);
  try {
    const role = await resolveModelRole(ModelRole.Main, config, database,);
    if (!role.provider || !role.model) {
      return { code: "llm_unavailable", message: "No LLM provider configured", };
    }

    const resolved = await resolveProvider({
      provider: role.provider,
      model: role.model,
      userId,
      config,
      db: database,
    },);

    const failoverList = buildFailoverList(resolved.resolvedProviderName, config,);
    const req: GenerateRequest = {
      model: resolved.resolvedModel,
      messages: messages as never,
      apiKey: resolved.resolvedApiKey,
      params: { temperature: 0.7, maxTokens: 2048, },
    };

    const response = await callWithFailover(failoverList, req,);
    if (!response.content) {
      return { code: "llm_unavailable", message: "LLM returned empty content", };
    }

    return { ok: true, content: response.content, };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error,);
    log.warn("Merge LLM call failed", { chatId, error: message, },);
    return { code: "llm_unavailable", message: "LLM call failed", };
  }
}
