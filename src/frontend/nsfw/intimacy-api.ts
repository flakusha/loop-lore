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
import { jsonBody, safeJsonParse, } from "../alpine/json";
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
  /** Staging context (`positionContext`) — persisted verbatim into history. */
  context?: string;
}

/** Outcome of an apply attempt — never throws. */
export type ApplyIntimacyOutcome =
  | { status: "ok"; outcome: IntimacyApplyOutcome }
  | { status: "error"; error: IntimacyError };

/**
 * Extract the gate message from a failure body. The NSFW gate answers with
 * the JSON error envelope (`{error, code, meta}` — http-utils/errors.ts),
 * never with bare text; anything that is not a JSON object carrying a
 * string `error` falls back to the raw body (older callers, proxies).
 * @param body - response body text (may be empty)
 * @returns {string} the message to classify on
 */
function gateMessage(body: string,): string {
  if (!body.trimStart().startsWith("{",)) { return body; }

  const parsed = safeJsonParse<unknown>(body,);
  if (parsed.ok) {
    const value = parsed.value;
    if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "string") {
      return value.error;
    }
  }

  return body;
}

/**
 * Classify a non-2xx apply response into the flow's error kinds.
 *
 * Mirrors `nsfwAccessErrorResponse` (src/routes/nsfw/shared.ts:168-174):
 * 401 → auth; 403 with the gate prefix and a consent reason → consent;
 * other 403 → target; 422 → validation; everything else → network.
 * The gate writes the prefix into the envelope's `error` field, so the
 * body is unwrapped via gateMessage before classification.
 * @param status - HTTP status of the failed response
 * @param message - response body text (JSON error envelope or raw text)
 * @returns {IntimacyError} the classified failure
 */
export function classifyApplyFailure(status: number, message: string,): IntimacyError {
  const gate = gateMessage(message,);
  if (status === 401) { return { kind: "auth", message: gate, }; }
  if (status === 403) {
    if (gate.startsWith(DENIED_PREFIX,)) {
      const reason = gate.slice(DENIED_PREFIX.length,);
      if (CONSENT_REASONS.has(reason,)) { return { kind: "consent", message: gate, }; }
    }

    return { kind: "target", message: gate, };
  }

  if (status === 422) { return { kind: "validation", message: gate, }; }
  return { kind: "network", message: gate, };
}

/**
 * Read a failure body and classify it — the shared tail of the POST helpers.
 * @param res - the non-ok fetch response
 * @returns {Promise<IntimacyError>} the classified failure
 */
async function failureOf(res: Response,): Promise<IntimacyError> {
  let message = "";

  try {
    message = (await res.text()).slice(0, 300,);
  } catch { /* body unreadable — classify on status */ }

  return classifyApplyFailure(res.status, message,);
}

/** Outcome of a consent-grant attempt — never throws. */
export type GrantConsentOutcome =
  | { status: "ok" }
  | { status: "error"; error: IntimacyError };

/**
 * Grant persisted chat consent via `POST /api/v1/nsfw/consent`.
 *
 * The route takes the caller's explicit consent action for one chat
 * (`NsfwConsentBody`: chatId + `given`/`revoked`); the user id comes from
 * the session, never from the body. Failures run the same classifier as
 * apply — a non-ok POST still carries the gate's JSON error envelope.
 * @param chatId - chat the consent grant is scoped to
 * @returns {Promise<GrantConsentOutcome>} ok on a persisted grant, or a classified error
 */
export async function grantIntimacyConsent(chatId: string,): Promise<GrantConsentOutcome> {
  try {
    const res = await apiFetch("/api/v1/nsfw/consent", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: jsonBody({ chatId, action: "given", },),
    },);

    if (!res.ok) {
      return { status: "error", error: await failureOf(res,), };
    }

    return { status: "ok", };
  } catch {
    return { status: "error", error: { kind: "network", }, };
  }
}

/**
 * Apply an intimacy action via `POST /api/v1/nsfw/intimacy/action`.
 *
 * Sends exactly the schema's known fields (Elysia silently strips unknown
 * keys — LANE-nsfw-consent.md:17), with `chatId` always present: the
 * consent gate is chat-scoped and the companion lane promotes it to a
 * required DTO field. `context` carries the client-side staging label
 * (`positionContext`); the backend persists it verbatim into history.
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
        // DTO is t.Optional(t.String) with no Nullable (nsfw.ts:25): an
        // explicit null key fails validation, so omit the key when unset.
        ...(input.context ? { context: input.context, } : {}),
      },),
    },);

    if (!res.ok) {
      return { status: "error", error: await failureOf(res,), };
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
