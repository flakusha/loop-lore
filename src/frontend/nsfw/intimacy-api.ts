// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW intimacy interface — apply-action API layer
 * (TASK-nsfw-intimacy-interface).
 *
 * The only module allowed to hold the intimacy action wire strings. Every
 * failure is classified into the flow's stable error kinds (plan §4) before
 * it reaches the UI; nothing here throws — callers get a result envelope
 * mirroring `NsfwFetchResult`'s never-reject convention.
 */

import { apiFetch, } from "../alpine/htmx";
import { jsonBody, } from "../alpine/json";
import { toResult, } from "../alpine/nsfw-panel/api";
import { actionLabel, type IntimacyActionView, type IntimacyApplyOutcome, type IntimacyError, } from "./intimacy-types";

/** Stable prefix the NSFW gate writes before the failure reason (shared.ts:173). */
const DENIED_PREFIX = "NSFW access denied: ";

/** Reasons the consent gate emits (NsfwRouteAccessFailure, shared.ts:32-44). */
const CONSENT_REASONS = new Set(["consent_required", "consent_revoked",],);

/** Input for {@link applyIntimacyAction} — chatId is always present (plan §5). */
export interface ApplyIntimacyInput {
  /** Active chat id — the consent gate is chat-scoped. */
  chatId: string;
  /** The acting chat character's actor id. */
  actorId: string;
  /** Selected partner's actor id. */
  targetActorId: string;
  /** Optional world scope forwarded verbatim. */
  worldId?: string | null;
  /** Selected catalog action (sent field-by-field). */
  action: IntimacyActionView;
}

/** Outcome of an apply attempt — never throws. */
export type ApplyIntimacyOutcome =
  | { status: "ok"; outcome: IntimacyApplyOutcome }
  | { status: "error"; error: IntimacyError };

/**
 * Classify a non-2xx apply response into the flow's error kinds.
 *
 * Mirrors `nsfwAccessErrorResponse` (src/routes/nsfw/shared.ts:168-174):
 * 401 → auth; 403 with the gate prefix and a consent reason → consent;
 * other 403 → target; 422 → validation; everything else → network.
 * @param status - HTTP status of the failed response
 * @param message - response body text (may be empty)
 * @returns {IntimacyError} the classified failure
 */
export function classifyApplyFailure(status: number, message: string,): IntimacyError {
  if (status === 401) { return { kind: "auth", message, }; }
  if (status === 403) {
    if (message.startsWith(DENIED_PREFIX,)) {
      const reason = message.slice(DENIED_PREFIX.length,);
      if (CONSENT_REASONS.has(reason,)) { return { kind: "consent", message, }; }
    }

    return { kind: "target", message, };
  }

  if (status === 422) { return { kind: "validation", message, }; }
  return { kind: "network", message, };
}

/**
 * Apply an intimacy action via `POST /api/v1/nsfw/intimacy/action`.
 *
 * Sends exactly the schema's known fields (Elysia silently strips unknown
 * keys — LANE-nsfw-consent.md:17), with `chatId` always present: the
 * consent gate is chat-scoped and the companion lane promotes it to a
 * required DTO field.
 * @param input - chat/partner/action descriptor
 * @returns {Promise<ApplyIntimacyOutcome>} ok with the apply result, or a classified error
 */
export async function applyIntimacyAction(input: ApplyIntimacyInput,): Promise<ApplyIntimacyOutcome> {
  try {
    const res = await apiFetch("/api/v1/nsfw/intimacy/action", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: jsonBody({
        chatId: input.chatId,
        actorId: input.actorId,
        targetActorId: input.targetActorId,
        worldId: input.worldId ?? null,
        actionId: input.action.id,
        actionName: actionLabel(input.action,),
        actionType: input.action.type,
        delta: input.action.delta,
        minIntimacy: input.action.minIntimacy,
        requiresConsent: input.action.requiresConsent,
      },),
    },);

    if (!res.ok) {
      let message = "";
      try {
        message = (await res.text()).slice(0, 300,);
      } catch { /* body unreadable — classify on status */ }

      return { status: "error", error: classifyApplyFailure(res.status, message,), };
    }

    const result = await toResult<IntimacyApplyOutcome>(res,);
    if (result.status !== "ok") {
      return { status: "error", error: { kind: "network", }, };
    }

    return { status: "ok", outcome: result.data, };
  } catch {
    return { status: "error", error: { kind: "network", }, };
  }
}
