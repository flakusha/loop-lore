// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — pre-generation seam (WI-5).
 *
 * Runs the gate on the ACTOR/user message BEFORE the LLM is invoked
 * (mirroring the NSFW eligibility precheck in triggerAutoGeneration), so
 * verdicts can shape the current generation instead of only the next one:
 *
 * - soft-refuse: consumes the beat — the attempted-action message row is
 *   marked `status: rejected` (the shipped skip interlock then refuses a
 *   skip of the same beat: one outcome per beat) and the attempted-action
 *   framing is returned for injection into the GM/narration prompt.
 * - hard-block: writes the OOC system notice (content_type `system`) that
 *   offers the turn-skip escape hatch (TASK-turn-skip-gate-interlock) and
 *   reports `blocked` so the caller aborts generation.
 * - annotate: returns the contradiction hint for prompt injection.
 * - allow: nothing.
 *
 * Every evaluation emits the `gate.verdict` plugin event.
 */
import { type Kysely, } from "kysely";

import { MessageContentType, MessageRole, MessageStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { emitPluginEvent, } from "../plugins/event-bus";
import { registry, } from "../plugins/registry";
import type { EventHandlerDefinition, } from "../plugins/types";
import { safeJsonStringify, } from "../utils";
import { createImmersionGate, } from "./engine";
import {
  buildAnnotateHint,
  buildHardBlockNotice,
  buildSoftRefuseFraming,
  gateVerdictEventPayload,
} from "./narration";
import type { ImmersionGateConfig, } from "./types";
import { GateSeverity, } from "./types";

/** Result of {@link runImmersionGatePrecheck}. */
export interface ImmersionPrecheckResult {
  /** What the caller must do with the current generation. */
  readonly action: "continue" | "blocked";
  /** Prompt text to append to the GM/narration system prompt (annotate/soft-refuse). */
  readonly promptInjection?: string;
  /** True when soft-refuse consumed the beat (message marked rejected). */
  readonly beatConsumed?: boolean;
}

/** Arguments for {@link runImmersionGatePrecheck}. */
export interface ImmersionPrecheckArgs {
  readonly db: Kysely<DB>;
  readonly config?: ImmersionGateConfig;
  readonly chatId: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly worldId: string | null;
  /** The actor/user message content under evaluation. */
  readonly content: string | undefined;
  /** The stored beat message row id (null for greetings). */
  readonly parentMessageId: string | null;
  /** Plugin event handlers; defaults to the global registry. */
  readonly eventHandlers?: EventHandlerDefinition[];
}

/**
 * Evaluate the actor's message through the immersion gate before
 * generation and apply the verdict's message-level effects.
 * @param {ImmersionPrecheckArgs} args
 * @returns {Promise<ImmersionPrecheckResult>}
 */
export async function runImmersionGatePrecheck(
  args: ImmersionPrecheckArgs,
): Promise<ImmersionPrecheckResult> {
  const { db, chatId, actorId, actorName, worldId, content, parentMessageId, } = args;
  const log = getLogger().child({ module: "immersion-gate-precheck", },);
  const eventHandlers = args.eventHandlers ?? registry.getAllEventHandlers();

  if (content === undefined || content.trim().length === 0) {
    return { action: "continue", };
  }

  const gate = createImmersionGate({ db, config: args.config, },);
  const verdict = await gate.evaluate({ chatId, actorId, worldId, content, },);

  await emitPluginEvent(
    eventHandlers,
    "gate.verdict",
    gateVerdictEventPayload(verdict, { chatId, actorId, },),
  );

  if (verdict.severity === GateSeverity.Allow) {
    log.debug("immersion gate allow", { chatId, actorId, },);
    return { action: "continue", };
  }

  if (verdict.severity === GateSeverity.Annotate) {
    return { action: "continue", promptInjection: buildAnnotateHint(verdict,), };
  }

  if (verdict.severity === GateSeverity.SoftRefuse) {
    const beatConsumed = await consumeBeat(db, chatId, parentMessageId,);
    log.info("immersion gate soft-refuse: beat consumed", { chatId, actorId, beatConsumed, ruleId: verdict.ruleId, },);
    return {
      action: "continue",
      promptInjection: buildSoftRefuseFraming(verdict,),
      beatConsumed,
    };
  }

  await writeHardBlockNotice(db, {
    chatId,
    actorId,
    notice: buildHardBlockNotice(verdict, { actorName, },),
    ruleId: verdict.ruleId,
  },);

  log.info("immersion gate hard-block: generation aborted", { chatId, actorId, ruleId: verdict.ruleId, },);
  return { action: "blocked", };
}

/**
 * Mark the beat message row rejected so the shipped skip interlock refuses
 * a skip of the same beat (`recordTurnSkip` → `refused_beat`). Legal per
 * the message status machine: `confirmed → rejected` was added for exactly
 * this producer side, and the composite already validates `rejected:visible`.
 * @param {Kysely<DB>} db
 * @param {string} chatId
 * @param {string | null} parentMessageId
 * @returns {Promise<boolean>} Whether a row was marked.
 */
async function consumeBeat(
  db: Kysely<DB>,
  chatId: string,
  parentMessageId: string | null,
): Promise<boolean> {
  if (parentMessageId === null) { return false; }
  const result = await db
    .updateTable("messages",)
    .set({ status: MessageStatus.Rejected, },)
    .where("id", "=", parentMessageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  return Number(result?.numUpdatedRows ?? 0,) > 0;
}

/**
 * Write the OOC hard-block notice as a system-kind message (SC7: hard-block
 * → `kind: system`), carrying the skip affordance in metadata for the UI.
 * @param {Kysely<DB>} db
 * @param {object} args
 * @param {string} args.chatId
 * @param {string} args.actorId
 * @param {string} args.notice
 * @param {string | null} args.ruleId
 * @returns {Promise<void>}
 */
async function writeHardBlockNotice(
  db: Kysely<DB>,
  args: {
    chatId: string;
    actorId: string;
    notice: string;
    ruleId: string | null;
  },
): Promise<void> {
  const metaResult = safeJsonStringify({
    immersionGate: { verdict: "hard-block", ruleId: args.ruleId, skipOffered: true, },
  },);

  await db
    .insertInto("messages",)
    .values({
      id: crypto.randomUUID(),
      chat_id: args.chatId,
      actor_id: args.actorId,
      parent_id: null,
      role: MessageRole.System,
      content: args.notice,
      content_plaintext: args.notice,
      content_type: MessageContentType.System,
      status: MessageStatus.Confirmed,
      metadata: metaResult.ok ? metaResult.value : null,
    },)
    .execute();
}
