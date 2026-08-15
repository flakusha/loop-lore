/**
 * Moderation Hook — Flags content for moderation review.
 *
 * Detects policy-violating language (hate speech, harassment, threats) using
 * tokenized, word-boundary matching with severity scoring, an audit trail, and
 * non-destructive suppression:
 *
 * - Tokenized matching — keywords are matched as whole words, never as substrings
 *   (so "assume" never matches "abuse" inside it, and "harassment" only matches
 *   when listed explicitly). False positives from substring matching are gone.
 * - Severity scoring — each hit contributes a weighted score; the overall
 *   severity (severe > moderate) drives suppression.
 * - Audit trail — every flag is recorded via `NsfwModerationService.recordAction`,
 *   mirroring the NSFW hook, so flagged content is never silently dropped.
 * - Non-destructive — only `severe` content is suppressed from posting; the
 *   severity, score, and matched terms are preserved in the hook data and audit
 *   log for review.
 */

import { type Kysely, } from "kysely";
import { type DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { NsfwModerationService, } from "../../nsfw/moderation-service";
import type { HookContext, HookEventType, HookHandler, HookResult, } from "./types";

export type ModerationSeverity = "severe" | "moderate";

export interface ModerationMatch {
  term: string;
  severity: ModerationSeverity;
  count: number;
}

export interface ModerationFlags {
  severity: ModerationSeverity;
  score: number;
  matched: ModerationMatch[];
}

export interface ModerationAuditRecorder {
  recordAction(params: {
    actionType: string;
    targetUserId: string;
    performedBy: string;
    reason: string;
    scope: string;
    scopeId: string | null;
  },): Promise<unknown>;
}

export interface ModerationHookDeps {
  /** Audit recorder factory; injectable for tests. Defaults to `NsfwModerationService` bound to `context.db`. */
  auditRecorder?: (db: Kysely<DB>,) => ModerationAuditRecorder;
}

/**
 * Exact word tokens — matched as whole words, case-insensitive. Common
 * morphological variants are listed explicitly because tokenized matching never
 * matches a substring (e.g. "violent" ≠ "violence", "harassment" ≠ "harass").
 */
const SEVERE_KEYWORDS: readonly { term: string; weight: number }[] = [
  { term: "hate", weight: 3, },
  { term: "hateful", weight: 3, },
  { term: "hatred", weight: 3, },
  { term: "violence", weight: 3, },
  { term: "violent", weight: 3, },
  { term: "violently", weight: 3, },
  { term: "threat", weight: 3, },
  { term: "threaten", weight: 3, },
  { term: "threatened", weight: 3, },
  { term: "threatening", weight: 3, },
  { term: "abuse", weight: 3, },
  { term: "abused", weight: 3, },
  { term: "abusive", weight: 3, },
  { term: "harass", weight: 3, },
  { term: "harassed", weight: 3, },
  { term: "harassment", weight: 3, },
  { term: "harassing", weight: 3, },
];

const MODERATE_KEYWORDS: readonly { term: string; weight: number }[] = [
  { term: "insult", weight: 2, },
  { term: "insulted", weight: 2, },
  { term: "insulting", weight: 2, },
  { term: "offensive", weight: 2, },
  { term: "offensively", weight: 2, },
  { term: "rude", weight: 2, },
  { term: "rudely", weight: 2, },
  { term: "rudeness", weight: 2, },
  { term: "disrespect", weight: 2, },
  { term: "disrespectful", weight: 2, },
];

export class ModerationHook implements HookHandler {
  readonly name = "moderation";
  readonly eventTypes: HookEventType[] = ["moderation_flag",];

  private readonly auditRecorderFactory: (db: Kysely<DB>,) => ModerationAuditRecorder;
  private recorder: ModerationAuditRecorder | null = null;

  constructor(deps?: Partial<ModerationHookDeps>,) {
    this.auditRecorderFactory = deps?.auditRecorder ?? ((db,) => new NsfwModerationService(db,));
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- GenerationHook.canHandle interface requires Promise<boolean>
  async canHandle(content: string, _context: HookContext,): Promise<boolean> {
    return content.length > 10;
  }

  async execute(content: string, context: HookContext,): Promise<HookResult> {
    const log = getLogger();
    log.debug("moderation-hook: scanning content for flags", { contentLength: content.length, },);

    const flags = this.detectModerationFlags(content,);
    if (!flags) {
      return { handled: false, eventType: "moderation_flag", };
    }

    const suppress = flags.severity === "severe";
    await this.recordAudit(context, flags, suppress,);

    const matched = Array.from(flags.matched, (m,) => m.term,).join(", ",);
    log.warn("moderation-hook: content flagged", {
      severity: flags.severity,
      score: flags.score,
      matched,
      suppressed: suppress,
    },);

    return {
      handled: true,
      eventType: "moderation_flag",
      data: {
        flagged: true,
        severity: flags.severity,
        score: flags.score,
        matched: Array.from(flags.matched, (m,) => ({ term: m.term, count: m.count, }),),
        // Backward-compatible severity list (severe/moderate), kept for existing consumers.
        flags: [flags.severity,],
      },
      suppressContent: suppress,
      reason: `Content flagged for moderation (${flags.severity}, score ${flags.score}): ${matched}`,
    };
  }

  /**
   * Tokenized, word-boundary detection. Content is split into whole-word tokens
   * (case-insensitive); each keyword is counted only when it appears as a complete
   * token, so substring matches never trigger a flag. The weighted score sums
   * `count × weight` per matched keyword; overall severity is "severe" when any
   * severe keyword matched, otherwise "moderate".
   */
  detectModerationFlags(content: string,): ModerationFlags | null {
    const tokenCounts = new Map<string, number>();
    for (const token of content.toLowerCase().split(/[^a-z0-9]+/,)) {
      if (token.length === 0) { continue; }
      tokenCounts.set(token, (tokenCounts.get(token,) ?? 0) + 1,);
    }

    const matched: ModerationMatch[] = [];
    let score = 0;
    let anySevere = false;

    const collect = (keywords: readonly { term: string; weight: number }[], severity: ModerationSeverity,): void => {
      for (const kw of keywords) {
        const count = tokenCounts.get(kw.term,) ?? 0;
        if (count === 0) { continue; }
        matched.push({ term: kw.term, severity, count, },);
        score += count * kw.weight;
        if (severity === "severe") { anySevere = true; }
      }
    };

    collect(SEVERE_KEYWORDS, "severe",);
    collect(MODERATE_KEYWORDS, "moderate",);

    if (matched.length === 0) { return null; }
    return {
      severity: anySevere ? "severe" : "moderate",
      score,
      matched,
    };
  }

  private getAuditRecorder(context: HookContext,): ModerationAuditRecorder {
    if (!this.recorder) {
      this.recorder = this.auditRecorderFactory(context.db,);
    }
    return this.recorder;
  }

  private async recordAudit(
    context: HookContext,
    flags: ModerationFlags,
    suppressed: boolean,
  ): Promise<void> {
    try {
      const recorder = this.getAuditRecorder(context,);
      await recorder.recordAction({
        actionType: suppressed ? "content_blocked" : "content_flagged",
        targetUserId: context.actorId,
        performedBy: "system",
        reason: `Moderation ${suppressed ? "blocked" : "flagged"}: ${flags.severity} (score ${flags.score}) — ${
          Array.from(flags.matched, (m,) => `${m.term}×${m.count}`,).join(", ",)
        }`,
        scope: "chat",
        scopeId: context.chatId,
      },);
    } catch (error) {
      getLogger().warn("moderation-hook: failed to record audit log", { error: String(error,), },);
    }
  }
}
