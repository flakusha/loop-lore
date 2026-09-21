// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { jsonBody, } from "../../alpine/json";
import { $, } from "../../dom";
import { feFetch, } from "../../fe-fetch";
import { showToast, } from "../../ui";
import { getErrorMessage, } from "../shared";
import type { NewChatCtx, } from "./state";

/**
 * @param ctx
 */
export function bindSubmitHandler(ctx: NewChatCtx,): void {
  ctx.form!.addEventListener("submit", async function(e: Event,) {
    e.preventDefault();
    const nameInput = ctx.form!.querySelector<HTMLInputElement>('[name="name"]',);
    if (!nameInput) { return; }
    const name = nameInput.value.trim();
    if (!name) { return; }

    const btn = ctx.form!.querySelector<HTMLButtonElement>('[type="submit"]',);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Creating...";
    }

    try {
      const payload = collectNewChatPayload(ctx, name,);
      const res = await feFetch("/api/v1/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(payload,),
      },);
      if (res.ok) {
        await handleCreateSuccess(
          res,
          payload.personaId as string | undefined,
          payload.impersonateActorId as string | undefined,
          payload.gmGuided as boolean,
        );
      } else {
        showToast("error", await getErrorMessage(res, "Failed to create chat",),);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Create Chat";
        }
      }
    } catch {
      showToast("error", "Network error",);
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Create Chat";
      }
    }
  },);
}

/**
 * Collect the chat-creation payload from the form + UI state.
 * @param ctx
 * @param name
 */
function collectNewChatPayload(ctx: NewChatCtx, name: string,): Record<string, unknown> {
  const personaId = $<HTMLSelectElement>("#persona-select",)?.value || undefined;
  const impersonateId = ctx.impersonateToggle?.checked && ctx.selected.length === 1
    ? ctx.selected[0].id
    : undefined;
  const memoryCarryMode = $<HTMLInputElement>('input[name="memory_carry"]:checked',)?.value || "full";
  const memoryCarryIds = memoryCarryMode === "selective"
    ? Array.from(ctx.selectedMemoryIds,)
    : undefined;
  const templateId = $<HTMLSelectElement>("#chat-template",)?.value || undefined;
  const mode = $<HTMLSelectElement>("#chat-mode",)?.value ?? "direct";
  const gmGuided = $<HTMLInputElement>("#gm-guided-toggle",)?.checked ?? false;

  // Fine-tune overrides: only sent when the user picked a non-default value.
  const turnStrategy = $<HTMLSelectElement>("#chat-turn-strategy",)?.value || undefined;
  const worldId = $<HTMLSelectElement>("#chat-world",)?.value || undefined;
  const visibility = $<HTMLSelectElement>("#chat-visibility",)?.value || undefined;
  const visualNovel = $<HTMLInputElement>("#chat-visual-novel",)?.checked;
  const fineTunePayload: Record<string, unknown> = {};
  if (turnStrategy) { fineTunePayload.turnStrategy = turnStrategy; }
  if (worldId) { fineTunePayload.worldId = worldId; }
  if (visibility) { fineTunePayload.visibility = visibility; }
  // VN checkbox is only visible with a template selected, and the template
  // pre-fills it — send the real state so it can be toggled off too. The
  // legacy `visualNovel` field was replaced by `renderingOverride` (see
  // `ChatCreateBody`); `null` means "no explicit override" (let the template
  // default decide).
  if (templateId) { fineTunePayload.renderingOverride = visualNovel === true ? "visual_novel" : null; }

  return {
    name,
    type: ctx.chatType!.value,
    mode: gmGuided ? "story" : mode,
    participantIds: Array.from(ctx.selected, (a: any,) => a.id,),
    personaId,
    impersonateActorId: impersonateId,
    memoryCarry: memoryCarryMode,
    memoryCarryIds,
    templateId,
    ...fineTunePayload,
    ...(gmGuided && { gmConfig: { assistantRole: "gm", storyMode: true, }, }),
  };
}

/**
 * Post-create: attach persona/impersonation then redirect to the chat.
 * @param res
 * @param personaId
 * @param impersonateId
 * @param gmGuided
 */
async function handleCreateSuccess(
  res: Response,
  personaId: string | undefined,
  impersonateId: string | undefined,
  gmGuided: boolean,
): Promise<void> {
  const d = await res.json();
  // Attach persona/impersonation BEFORE navigating: a fire-and-forget PUT is
  // cancelled by the redirect's navigation, leaving the new chat without the
  // selected persona. Best-effort — an attach failure must not block opening
  // the chat.
  if (personaId) {
    try {
      await feFetch(`/api/v1/chats/${d.id}/persona`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ personaId, },),
      },);
    } catch {
      /* persona attach is best-effort; still open the chat */
    }
  }
  if (impersonateId) {
    try {
      await feFetch(`/api/v1/chats/${d.id}/impersonate`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ impersonateActorId: impersonateId, },),
      },);
    } catch {
      /* impersonation attach is best-effort; still open the chat */
    }
  }
  location.assign(`/views/chat?chatid=${encodeURIComponent(d.id,)}${gmGuided ? "&openSettings=1" : ""}`,);
}
