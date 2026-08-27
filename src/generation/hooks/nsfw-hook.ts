// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Hook — keyword + (optional) LLM classifier; gates post-LLM
 * character output against policy.
 *
 * Bug-fix history (see `fix-nsfw-gate-correctness` worktree):
 *   - ccb8879 — gate was originally run AFTER callLlm. Pre-LLM gating is
 *     wired at the orchestrator (`src/generation/auto-gen/auto-generation.ts`).
 *     This hook now serves as defense-in-depth: it scans LLM output before
 *     storage and can still block / suppress.
 *   - da08f1b — bare `catch{}` around `getEffectiveNsfw` was fail-open.
 *     Now any DB error logs an `admin_emergency_block` decision and returns
 *     suppressContent; the content path is closed on failure.
 *   - da08f1b — the `length > 20` short-circuit in `canHandle` was a trivial
 *     evasion (NSFW keywords under 20 chars bypassed the gate). Short content
 *     still passes `canHandle` as long as NSFW is allowed; the scan inside
 *     `execute` is unbounded.
 *   - 9575d31 — every gate decision now flows through `logNsfwEvent` so the
 *     audit log carries the action bucket + severity reason. Attribution uses
 *     the authenticated user (`context.userId`) for `performedBy`; the
 *     character remains `targetUserId` (this is the character the gate
 *     decided about — a follow-up column would be cleaner but is out of
 *     scope for this fix).
 */
import { callAux, } from "../../aux-pipeline";
import { getLogger, } from "../../logger";
import { logNsfwEvent, } from "../../middleware/nsfw-gate/logging";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import type { NsfwGateReason, } from "../../nsfw/pii-redaction";
import { NSFW_RATING_SEVERITY, } from "../../schemas";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

import { detectNsfwLevel, detectNsfwWithLlm, } from "./nsfw-classifier";
import { isAllowed, levelToRating, } from "./nsfw-rating";

export interface NsfwHookDeps {
  /** LLM rating runner; injectable for tests. Defaults to the AUX pipeline. */
  callAux: typeof callAux;
  /** Moderation service; injectable for tests. Defaults to per-context DB construction. */
  modService?: NsfwModerationService;
}

export class NsfwHook implements HookHandler {
  readonly name = "nsfw";

  readonly eventTypes: HookEventType[] = ["nsfw_gate", "privacy_check",];

  private modService: NsfwModerationService | null = null;

  private readonly callAuxFn: typeof callAux;

  private readonly injectedModService: NsfwModerationService | null = null;

  constructor(deps?: Partial<NsfwHookDeps>,) {
    this.callAuxFn = deps?.callAux ?? callAux;
    this.injectedModService = deps?.modService ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.canHandle interface requires Promise<boolean>
  async canHandle(_content: string, _context: HookContext,): Promise<boolean> {
    // No length bypass: short content can carry NSFW tokens. canHandle only
    // answers "is this hook applicable?" — it gates on the global toggle.
    return _context.nsfwConfig.allowNsfw;
  }

  async execute(_content: string, _context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("nsfw-hook: checking content against policy", { policy: _context.nsfwPolicy, },);

    // Resolve effective NSFW setting (per-chat > per-world > user pref).
    // DB error or missing prefs → fail closed (was fail-open, see da08f1b).
    let effectiveSource = "user_preference";
    try {
      const svc = this.getModService(_context,);
      const effective = await svc.getEffectiveNsfw(_context.chatId, _context.userId,);
      effectiveSource = effective.source;
      if (!effective.enabled) {
        log.debug("nsfw-hook: NSFW disabled by override", { source: effective.source, },);
        await this.logGateDecision(_context, "blocked", "user_override_disabled", { source: effective.source, },);
        return {
          handled: true,
          eventType: "nsfw_gate",
          data: { nsfwLevel: "blocked_by_override", blocked: true, source: effective.source, },
          suppressContent: true,
          reason: `NSFW disabled by ${effective.source}`,
        };
      }
    } catch (error) {
      // DB unavailable or query failed: audit as admin_emergency_block and
      // refuse the content. No silent fall-through to a permissive policy.
      log.error(
        "nsfw-hook: effective-NSFW lookup failed; failing closed",
        error instanceof Error ? error : new Error(String(error,),),
      );
      await this.logGateDecision(_context, "blocked", "admin_emergency_block", {
        error: String(error,),
      },);
      return {
        handled: true,
        eventType: "nsfw_gate",
        data: { nsfwLevel: "blocked_by_error", blocked: true, },
        suppressContent: true,
        reason: "NSFW gate lookup failed; content blocked as defense-in-depth.",
      };
    }

    // Keyword detection is deterministic and fast; run it first.
    let nsfwLevel = detectNsfwLevel(_content,);

    // LLM classifier is the safety filter for the extreme tier the keyword pass
    // cannot name; let it escalate, keeping the more severe of the two ratings.
    if (_context.nsfwConfig.useLlmClassifier) {
      const llmLevel = await detectNsfwWithLlm(_content, _context, this.callAuxFn,);
      if (NSFW_RATING_SEVERITY[levelToRating(llmLevel,)] > NSFW_RATING_SEVERITY[levelToRating(nsfwLevel,)]) {
        nsfwLevel = llmLevel;
      }
    }

    if (nsfwLevel === "none") {
      // SFW content: audit "allowed" with no severity bucket so the log shows
      // the hook saw it and chose to pass through.
      await this.logGateDecision(_context, "allowed", "explicit_content_detected", { level: "none", },);
      return { handled: false, eventType: "nsfw_gate", };
    }

    const allowed = isAllowed(nsfwLevel, _context,);
    const reason = allowed ? "explicit_content_detected" : "rating_exceeded";
    await this.logGateDecision(_context, allowed ? "allowed" : "blocked", reason, {
      level: nsfwLevel,
      effectiveSource,
    },);

    if (!allowed) {
      log.warn("nsfw-hook: content blocked by policy gate", { nsfwLevel, policy: _context.nsfwPolicy, },);
      await this.recordAudit(_context, nsfwLevel, false,);
      return {
        handled: true,
        eventType: "nsfw_gate",
        data: { nsfwLevel, blocked: true, },
        suppressContent: true,
        reason: `Content level "${nsfwLevel}" exceeds policy "${_context.nsfwPolicy}"`,
      };
    }

    await this.recordAudit(_context, nsfwLevel, true,);
    return {
      handled: true,
      eventType: "nsfw_gate",
      data: { nsfwLevel, allowed: true, },
    };
  }

  private getModService(context: HookContext,): NsfwModerationService {
    if (this.injectedModService) {
      return this.injectedModService;
    }
    if (!this.modService) {
      this.modService = new NsfwModerationService(context.db,);
    }
    return this.modService;
  }

  /**
   * Audit every gate decision through `logNsfwEvent`. Wrapped in try/catch so
   * a logging failure cannot itself fail the gate decision.
   */
  private async logGateDecision(
    context: HookContext,
    action: "allowed" | "blocked" | "warning",
    reason: NsfwGateReason,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await logNsfwEvent(context.db, {
        userId: context.userId,
        actorId: context.actorId,
        chatId: context.chatId,
        action,
        reason,
        metadata,
      },);
    } catch (error) {
      getLogger().warn("nsfw-hook: logNsfwEvent failed", { error: String(error,), },);
    }
  }

  /**
   * Moderation audit (separate from `logNsfwEvent`) — recorded into
   * `moderation_actions` so admin review flows see NSFW gate outcomes.
   * Attribution: `performedBy` is the authenticated user (was hard-coded
   * "system" — see 9575d31).
   */
  private async recordAudit(context: HookContext, nsfwLevel: string, allowed: boolean,): Promise<void> {
    try {
      const svc = this.getModService(context,);
      await svc.recordAction({
        actionType: allowed ? "nsfw_detected" : "nsfw_blocked",
        targetUserId: context.actorId,
        performedBy: context.userId ?? "system",
        reason: `NSFW ${allowed ? "detected" : "blocked"}: level "${nsfwLevel}" ${
          allowed ? "within" : "exceeds"
        } policy "${context.nsfwPolicy}"`,
        scope: "chat",
        scopeId: context.chatId,
      },);
    } catch (error) {
      getLogger().warn("nsfw-hook: failed to record audit log", { error: String(error,), },);
    }
  }
}
