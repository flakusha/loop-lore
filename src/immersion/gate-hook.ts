// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — hook layer (WI-5).
 *
 * Registers the fictional-consistency gate alongside the content hooks
 * (mood/emotion/nsfw/moderation) as an INDEPENDENT layer: it reads actor
 * state ground truth, not content policy, and its verdicts drive refusal
 * narration rather than moderation suppression. Runs inside
 * `runContentHooks` chains wherever content hooks run.
 *
 * Verdict mapping (deterministic, severity-driven — SC7 kind semantics):
 * - allow: log only (no hook event).
 * - annotate: hook event carrying the contradiction hint.
 * - soft-refuse: hook event carrying the attempted-action framing; the
 *   message is NOT suppressed.
 * - hard-block: hook event + content suppression; the OOC notice and the
 *   skip affordance are emitted by the pre-generation seam
 *   (`pregeneration.ts`), which owns message writes.
 */
import type { Kysely, } from "kysely";

import type { DB, } from "../db/schema";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "../generation/hooks/types";
import { getLogger, } from "../logger";
import { emitPluginEvent, } from "../plugins/event-bus";
import { registry, } from "../plugins/registry";
import type { EventHandlerDefinition, } from "../plugins/types";
import { recordImmersionDecision, } from "./decision-log";
import { createImmersionGate, } from "./engine";
import { resolveImmersionGateConfig, } from "./gate-config";
import { buildAnnotateHint, buildSoftRefuseFraming, gateVerdictEventPayload, } from "./narration";
import type { ImmersionGateConfig, } from "./types";
import { GateSeverity, } from "./types";

/** Dependency surface for {@link ImmersionGateHook}. */
export interface ImmersionGateHookDeps {
  /** Rule config override (tests / per-chat surface); defaults when omitted. */
  readonly config?: ImmersionGateConfig;
  /** Plugin event handlers; defaults to the global registry. */
  readonly eventHandlers?: EventHandlerDefinition[];
}

/** */
export class ImmersionGateHook implements HookHandler {
  /** */
  readonly name = "immersion-gate";
  /** */
  readonly eventTypes: HookEventType[] = ["immersion_gate",];

  private readonly config?: ImmersionGateConfig;
  private readonly eventHandlers: EventHandlerDefinition[];

  /**
   * @param {ImmersionGateHookDeps} [deps]
   */
  constructor(deps?: ImmersionGateHookDeps,) {
    this.config = deps?.config;
    this.eventHandlers = deps?.eventHandlers ?? registry.getAllEventHandlers();
  }

  /**
   * @param {string} content
   * @param {HookContext} _context
   * @returns {Promise<boolean>}
   */
  async canHandle(content: string, _context: HookContext,): Promise<boolean> {
    return content.trim().length > 0;
  }

  /**
   * @param {string} content
   * @param {HookContext} context
   * @returns {Promise<HookResult>}
   */
  async execute(content: string, context: HookContext,): Promise<HookResult> {
    const log = getLogger().child({ module: "immersion-gate-hook", },);
    try {
      return await this.evaluateVerdict(content, context,);
    } catch (error) {
      // Fail OPEN: the gate is an advisory fictional-consistency layer — an
      // internal error (e.g. state reads unavailable in this context) must
      // never wedge generation. Logged for audit; nothing is suppressed.
      log.warn("immersion gate evaluation failed; failing open", {
        chatId: context.chatId,
        actorId: context.actorId,
        error: error instanceof Error ? error.message : String(error,),
      },);

      return { handled: false, eventType: "immersion_gate", };
    }
  }

  /**
   * @param {string} content
   * @param {HookContext} context
   * @returns {Promise<HookResult>}
   */
  private async evaluateVerdict(content: string, context: HookContext,): Promise<HookResult> {
    const log = getLogger().child({ module: "immersion-gate-hook", },);
    const db: Kysely<DB> = context.db;
    const chatState = await db
      .selectFrom("chats",)
      .select(["world_id", "gm_config",],)
      .where("id", "=", context.chatId,)
      .executeTakeFirst();

    const worldId = chatState?.world_id ?? null;
    // Per-chat severity/toggles (WI-6): explicit deps config wins.
    const chatConfig = this.config ?? resolveImmersionGateConfig(chatState?.gm_config ?? null,);

    const gate = createImmersionGate({ db, config: chatConfig, },);
    const verdict = await gate.evaluate({
      chatId: context.chatId,
      actorId: context.actorId,
      worldId,
      content,
    },);

    await recordImmersionDecision(db, {
      chatId: context.chatId,
      actorId: context.actorId,
      source: "hook",
      verdict,
    },);

    await emitPluginEvent(
      this.eventHandlers,
      "gate.verdict",
      gateVerdictEventPayload(verdict, { chatId: context.chatId, actorId: context.actorId, },),
    );

    if (verdict.severity === GateSeverity.Allow) {
      log.debug("immersion gate allow", { chatId: context.chatId, actorId: context.actorId, },);
      return { handled: false, eventType: "immersion_gate", };
    }

    if (verdict.severity === GateSeverity.Annotate) {
      return {
        handled: true,
        eventType: "immersion_gate",
        data: {
          verdict: "annotate",
          hint: buildAnnotateHint(verdict,),
          verdict_severity: verdict.severity,
          ruleId: verdict.ruleId,
        },
      };
    }

    if (verdict.severity === GateSeverity.SoftRefuse) {
      return {
        handled: true,
        eventType: "immersion_gate",
        data: {
          verdict: "soft-refuse",
          framing: buildSoftRefuseFraming(verdict,),
          verdict_severity: verdict.severity,
          ruleId: verdict.ruleId,
        },
      };
    }

    return {
      handled: true,
      eventType: "immersion_gate",
      suppressContent: true,
      reason: verdict.ruleId ?? "immersion-gate",
      data: { verdict: "hard-block", verdict_severity: verdict.severity, ruleId: verdict.ruleId, skipOffered: true, },
    };
  }
}
