// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Carriage authoring — LLM estimation of a chat's hidden episode-context
 * TOML block (epic-hidden-carriage-context, TASK-hidden-carriage-toml-context).
 *
 * One AUX call estimates the CURRENT carriage doc; `healCarriage` is the
 * approve-or-cancel gate: an approved document is persisted as a
 * scope=`carriage` record (payload `{ toml }`), a cancelled one writes
 * NOTHING (never partial state) and only surfaces a dev-visible warning.
 */
import type { Kysely, } from "kysely";
import { CARRIAGE_AUTHORING_PROMPT, } from "../../aux-pipeline/prompts";
import { callAux, } from "../../aux-pipeline/runner";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenerationMessage, } from "../../generation/gen-types-options";
import { getLogger, } from "../../logger";
import { safeJsonParse, } from "../../utils";
import { healCarriage, type HealingCancelReason, } from "../../utils/structured-output";
import type { GmConfig, } from "../types/config";
import { type CarriageRecord, listCarriage, recordCarriage, } from "./carriage";

/** Logger scoped to the carriage-authoring module. */
function getLog() {
  return getLogger().child({ module: "carriage-authoring", },);
}

/** Options for `authorCarriage` / `authorCarriageIfEnabled`. */
export interface CarriageAuthoringOpts {
  chatId: string;
  /** Latest assistant reply the estimate is based on. */
  aiContent: string;
  /** Latest user message, when one exists. */
  userContent?: string | null;
  /** Current carriage TOML to update, when the chat has one. */
  previousToml?: string | null;
  config: Config;
  userId?: string;
}

/**
 * Outcome of one authoring pass.
 * - `approved`: the estimate passed `healCarriage` and was persisted.
 * - `cancelled`: the gate rejected the estimate — no record written.
 * - `unavailable`: the AUX call returned null (never a healing cancel).
 */
export type CarriageAuthoringResult =
  | { status: "approved"; record: CarriageRecord }
  | { status: "cancelled"; reason: HealingCancelReason; hint: string }
  | { status: "unavailable" };

/**
 * Estimate the chat's carriage doc via one AUX call and persist it when the
 * healing gate approves. A cancel or an unavailable AUX call writes nothing.
 * @param db - Kysely instance
 * @param opts - Chat, latest turn contents, config, and prior TOML
 * @returns Discriminated result per {@link CarriageAuthoringResult}
 * @throws {Error} when the approved record cannot be persisted (DB failure)
 */
export async function authorCarriage(
  db: Kysely<DB>,
  opts: CarriageAuthoringOpts,
): Promise<CarriageAuthoringResult> {
  const turnParts: string[] = [];
  if (opts.userContent) { turnParts.push(`User: ${opts.userContent}`,); }
  turnParts.push(`Assistant: ${opts.aiContent}`,);

  const contextParts: string[] = [];
  if (opts.previousToml) {
    contextParts.push(`Current carriage block to update:\n${opts.previousToml}\n\n`,);
  }

  contextParts.push(`Latest turn:\n${turnParts.join("\n",)}`,);

  const messages: GenerationMessage[] = [
    { role: "system", content: CARRIAGE_AUTHORING_PROMPT, },
    { role: "user", content: contextParts.join("",), },
  ];

  const response = await callAux("carriage", opts.config, db, messages, {
    userId: opts.userId,
    chatId: opts.chatId,
    // TOML ledger stays small; deterministic estimate.
    maxTokens: 800,
    temperature: 0,
  },);

  if (!response) {
    // AUX unavailable is NOT a healing cancel — no warning, no write.
    getLog().debug("Carriage authoring AUX call failed",);
    return { status: "unavailable", };
  }

  const healing = healCarriage(response.content,);
  if (!healing.ok) {
    getLog().warn("carriage authoring cancelled", {
      chatId: opts.chatId,
      reason: healing.reason,
      hint: healing.hint,
    },);

    return { status: "cancelled", reason: healing.reason, hint: healing.hint, };
  }

  const record = await recordCarriage(db, {
    chatId: opts.chatId,
    scope: "carriage",
    payload: { toml: response.content, },
  },);

  return { status: "approved", record, };
}

/**
 * Background carriage hook — call after generation completes. Reads the
 * chat's `gm_config` toggle and, when carriage is enabled, re-authors the
 * carriage block from the latest turn plus the currently stored TOML.
 * Offline best-effort: never throws; failures are logged, not propagated.
 * @param db - Kysely instance
 * @param opts - Chat, latest turn contents, and config
 * @returns {Promise<void>}
 */
export async function authorCarriageIfEnabled(
  db: Kysely<DB>,
  opts: CarriageAuthoringOpts,
): Promise<void> {
  try {
    const chat = await db
      .selectFrom("chats",)
      .select("gm_config",)
      .where("id", "=", opts.chatId,)
      .executeTakeFirst();

    if (!chat?.gm_config) { return; }

    const gmConfig = safeJsonParse<GmConfig>(chat.gm_config,);
    if (!gmConfig.ok || gmConfig.value.carriageEnabled !== true) { return; }

    const previous = await listCarriage(db, opts.chatId, { limit: 1, scope: "carriage", },);
    let previousToml: string | null = null;
    const latest = previous[0];
    if (latest) {
      const payload = safeJsonParse<{ toml?: unknown }>(latest.payload,);
      if (payload.ok && typeof payload.value.toml === "string") {
        previousToml = payload.value.toml;
      }
    }

    await authorCarriage(db, {
      chatId: opts.chatId,
      aiContent: opts.aiContent,
      userContent: opts.userContent ?? null,
      previousToml,
      config: opts.config,
      userId: opts.userId,
    },);
  } catch (error) {
    getLog().warn("Background carriage authoring failed", {
      chatId: opts.chatId,
      error: (error as Error).message,
    },);
  }
}
