// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { BattleCombatantView, BattleView, } from "../../battle/panel";
import { apiFetch, } from "../htmx";
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log as rootLog, } from "../logger";
import type { ChatState, } from "../types";

const log = rootLog.child({ module: "chat-actions", },);

/** Context shape needed by command action dispatch helpers. */
interface DispatchCtx {
  $dispatch?: (event: string, detail: Record<string, unknown>,) => void;
  connectGenerationSSE: (chatId: string,) => void;
}

/** Handle 501 / error / success for generation-type command actions. */
async function dispatchGenerationAction(
  ctx: DispatchCtx,
  endpoint: string,
  body: Record<string, unknown>,
  label: string,
  chatId: string,
) {
  const prompt = (body.prompt as string) ?? "";
  if (!prompt && !body.assetIds) {
    ctx.$dispatch?.("show-toast", {
      type: "warning",
      message: t("toasts.actionNoInput", { action: label.toLowerCase(), },),
    },);
    return;
  }
  try {
    const res = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(body,),
    },);
    if (res.ok) {
      ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.actionStarted", { action: label, },), },);
      ctx.connectGenerationSSE(chatId,);
    } else if (res.status === 501) {
      ctx.$dispatch?.("show-toast", {
        type: "info",
        message: t("toasts.actionNotConfigured", { action: label, },),
      },);
    } else {
      const err = await res.json();
      ctx.$dispatch?.("show-toast", {
        type: "error",
        message: err.error || t("toasts.actionFailed", { action: label.toLowerCase(), },),
      },);
    }
  } catch {
    ctx.$dispatch?.("show-toast", {
      type: "error",
      message: t("toasts.actionNetworkError", { action: label.toLowerCase(), },),
    },);
  }
}

/** Dispatch create-quest command action. */
async function dispatchQuestAction(ctx: DispatchCtx, description: string, chatId: string,) {
  if (!description) {
    ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noQuestDescription",), },);
    return;
  }
  try {
    // Fetch chat to get world_id (backend requires /api/worlds/:worldId/quests)
    const chatRes = await apiFetch(`/api/v1/chats/${chatId}`,);
    if (!chatRes.ok) {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedLoadChatForQuest",), },);
      return;
    }
    const chat = await chatRes.json();
    const worldId = chat.world_id;
    if (!worldId) {
      ctx.$dispatch?.("show-toast", {
        type: "warning",
        message: t("toasts.questsRequireWorld",),
      },);
      return;
    }
    const res = await apiFetch(`/api/worlds/${worldId}/quests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ chatId, description, },),
    },);
    if (res.ok) {
      ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.questCreated",), },);
    } else {
      const err = await res.json();
      ctx.$dispatch?.("show-toast", {
        type: "error",
        message: err.error || t("toasts.failedCreateQuest",),
      },);
    }
  } catch {
    ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorCreatingQuest",), },);
  }
}

export const dispatch: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Dispatch a command action returned by the backend.
   *
   * Maps action strings to the appropriate API endpoint and fires the request.
   * Generation actions connect SSE for real-time progress streaming.
   *
   * @param action - Action identifier from CommandResult.action
   * @param payload - Action payload from CommandResult.actionPayload
   * @param chatId - Active chat ID
   */
  async dispatchCommandAction(action: string, payload: Record<string, unknown> | null, chatId: string,) {
    log.info("dispatchCommandAction", { action, chatId, },);

    const handler = actionHandlers[action];
    if (handler) {
      await handler(this, payload, chatId,);
      return;
    }

    // Check unimplemented generation actions
    if (["generate-music", "generate-sfx", "generate-video",].includes(action,)) {
      const label = action.replace("generate-", "",);
      this.$dispatch?.("show-toast", {
        type: "info",
        message: t("toasts.actionNotImplemented", { label, },),
      },);
      log.info("Unimplemented generation action", { action, },);
      return;
    }

    log.warn("Unknown command action", { action, },);
    this.$dispatch?.("show-toast", {
      type: "warning",
      message: t("toasts.unknownAction", { action, },),
    },);
  },
};

// ── Action handlers (extracted for cognitive complexity) ──────

type ActionHandler = (ctx: any, payload: Record<string, unknown> | null, chatId: string,) => Promise<void> | void;

const actionHandlers: Record<string, ActionHandler> = {
  "generate-image": async (ctx, payload, chatId,) => {
    await dispatchGenerationAction(
      ctx,
      "/api/generation/image",
      { prompt: (payload?.prompt as string) ?? "", chatId, },
      "Image generation",
      chatId,
    );
  },

  "generate-caption": async (ctx, payload, chatId,) => {
    const assetIds = (payload?.assetIds as string[]) ?? [];
    if (assetIds.length === 0) {
      ctx.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noAssetsToCaption",), },);
      return;
    }
    await dispatchGenerationAction(
      ctx,
      "/api/generation/caption",
      { chatId, assetIds, },
      "Captioning",
      chatId,
    );
  },

  "impersonate-toggle": async (ctx, payload, chatId,) => {
    const mode = (payload?.mode as string) ?? "toggle";
    if (mode === "off") {
      await apiFetch(`/api/v1/chats/${chatId}/impersonate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ impersonateActorId: null, },),
      },);
      ctx.impersonationActive = false;
      ctx.impersonatingActorId = null;
      ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.impersonationEnded",), },);
    } else {
      await (ctx as { toggleImpersonate(): Promise<void> }).toggleImpersonate();
    }
  },

  "impersonate-select": async (ctx, payload, chatId,) => {
    const characterName = (payload?.characterName as string) ?? "";
    if (!characterName) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${chatId}/participants`, {
        headers: { Accept: "application/json", },
      },);
      if (!res.ok) { return; }
      const participants = await res.json();
      const target = participants.find(
        (p: { display_name?: string; actor_type?: string },) =>
          p.actor_type === "character" &&
          p.display_name?.toLowerCase() === characterName.toLowerCase(),
      );
      if (!target) {
        ctx.$dispatch?.("show-toast", {
          type: "warning",
          message: t("toasts.characterNotFound", { name: characterName, },),
        },);
        return;
      }
      const putRes = await apiFetch(`/api/v1/chats/${chatId}/impersonate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ impersonateActorId: target.actor_id, },),
      },);
      if (putRes.ok) {
        ctx.impersonationActive = true;
        ctx.impersonatingActorId = target.actor_id;
        ctx.$dispatch?.("show-toast", {
          type: "info",
          message: t("toasts.playingAs", { name: target.display_name || characterName, },),
        },);
      } else {
        const err = await putRes.json();
        ctx.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || t("toasts.failedStartImpersonation",),
        },);
      }
    } catch {
      ctx.$dispatch?.("show-toast", { type: "error", message: t("toasts.networkErrorResolvingCharacter",), },);
    }
  },

  "create-quest": async (ctx, payload, chatId,) => {
    await dispatchQuestAction(ctx, (payload?.description as string) ?? "", chatId,);
  },

  "review-entity": (_ctx, payload,) => {
    log.info("review-entity action — display only", { payload, },);
  },

  // Battle commands render/update/clear the VN-style battle panel.
  "battle-started": (ctx, payload,) => {
    renderBattleFromPayload(ctx, payload,);
  },
  "battle-updated": (ctx, payload,) => {
    renderBattleFromPayload(ctx, payload,);
  },
  "battle-status": (ctx, payload,) => {
    renderBattleFromPayload(ctx, payload,);
  },
  "battle-ended": (ctx,) => {
    (ctx as { renderBattlePanel(view: unknown,): void }).renderBattlePanel(null,);
  },
};

/** Render the battle panel from a `battle-*` command action payload. */
function renderBattleFromPayload(
  ctx: unknown,
  payload: Record<string, unknown> | null,
): void {
  const raw = payload?.battle;
  if (!isBattleViewShape(raw,)) { return; }
  const combatants: BattleCombatantView[] = [];
  for (const c of raw.combatants) {
    if (!isCombatantShape(c,)) { continue; }
    combatants.push({
      id: c.id,
      name: c.name,
      hp: c.hp,
      maxHp: c.maxHp,
      initiative: c.initiative,
    },);
  }
  const view: BattleView = {
    id: raw.id,
    status: raw.status,
    round: raw.round,
    turnIndex: raw.turnIndex,
    combatants,
  };
  const panel = ctx as { renderBattlePanel(view: BattleView,): void } | null;
  panel?.renderBattlePanel(view,);
}

/** @returns true when `value` has the shape of a battle view payload. */
function isBattleViewShape(value: unknown,): value is {
  id: string;
  status: "active" | "completed" | "abandoned";
  round: number;
  turnIndex: number;
  combatants: unknown[];
} {
  if (!value || typeof value !== "object") { return false; }
  const v = value as Record<string, unknown>;
  const validStatus = ["active", "completed", "abandoned",].includes(String(v.status,),);
  return (
    typeof v.id === "string" &&
    validStatus &&
    typeof v.round === "number" &&
    typeof v.turnIndex === "number" &&
    Array.isArray(v.combatants,)
  );
}

/** @returns true when `value` has a combatant view shape. */
function isCombatantShape(value: unknown,): value is BattleCombatantView {
  if (!value || typeof value !== "object") { return false; }
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.hp === "number" &&
    typeof v.maxHp === "number" &&
    typeof v.initiative === "number"
  );
}
