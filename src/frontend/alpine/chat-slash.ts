// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Frontend slash routing (`/continue`, `/branch`, `/retry`) for the chat
 * composer: these resume prior assistant state through the existing
 * variant/branch actions instead of sending a chat message; an unknown
 * `/...` name toasts (with a did-you-mean hint when close) and never sends.
 *
 * Split out of chat-send.ts for the per-file size gate. chat-send.ts keeps
 * `interceptSlashSend` on the methods object, so the merged ChatState surface
 * and every caller are unchanged.
 */
import { t, } from "./i18n";
import { didYouMeanCandidate, } from "./slash-autocomplete";
import type { ChatState, } from "./types";

/**
 * Last assistant/character message id — the resume point for `/continue`.
 * @param ctx
 */
function lastAssistantMessageId(ctx: ChatState,): string | null {
  for (let i = ctx.messages.length - 1; i >= 0; i--) {
    const msg = ctx.messages[i]!;
    if (msg.role === "assistant" || msg.role === "character") { return msg.id; }
  }

  return null;
}

/**
 * Frontend slash router: `/continue` resumes the last assistant message.
 * @param ctx
 * @param text
 * @param input
 * @returns {Promise<boolean>} true when intercepted (do not send).
 */
export async function interceptSlashSend(
  ctx: ChatState,
  text: string,
  input: HTMLTextAreaElement,
): Promise<boolean> {
  const token = text.split(/\s+/,)[0] ?? "";
  const name = token.slice(1,).toLowerCase();
  const args = text.slice(token.length,).trim().split(/\s+/,).filter(Boolean,);
  if (!name) { return false; }
  const registry = (ctx._commandList ?? []).map((entry,) => entry.name);

  if (name === "continue") {
    const target = lastAssistantMessageId(ctx,);
    if (!target) {
      ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.nothingToContinue",), },);
    } else {
      input.value = "";
      await ctx.continueMessage?.(target,);
    }

    return true;
  }

  if (name === "retry") {
    // `/retry [attemptId] [step]`: args split into ids vs step numbers —
    // `/retry 2` with an active attempt means step 2, not attempt "2".
    const numeric = args.filter((arg,) => /^\d+$/.test(arg,));
    const nonNumeric = args.filter((arg,) => !/^\d+$/.test(arg,));
    const attemptId = ctx.activeAttemptId ?? nonNumeric[0];
    const step = Number(numeric[0] ?? 0,) || 0;
    if (!attemptId) {
      ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.nothingToRetry",), },);
    } else {
      input.value = "";
      await ctx.retryFromPoint?.(String(attemptId,), Number.isFinite(step,) ? step : 0,);
    }

    return true;
  }

  if (name === "branch") {
    const target = lastAssistantMessageId(ctx,);
    if (!target) {
      ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.nothingToBranch",), },);
    } else {
      input.value = "";
      await ctx.forkFromMessage?.(target, args.join(" ",) || undefined,);
    }

    return true;
  }

  if (registry.length > 0 && !registry.map((entry,) => entry.toLowerCase()).includes(name,)) {
    const suggestion = didYouMeanCandidate(registry, name,);
    ctx.$dispatch?.("show-toast", {
      type: "warning",
      message: suggestion
        ? t("toasts.unknownCommandSuggest", { name, suggestion, },)
        : t("toasts.unknownCommand", { name, },),
    },);

    return true;
  }

  return false;
}
