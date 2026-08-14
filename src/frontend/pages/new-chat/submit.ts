import { jsonBody, } from "../../alpine/json";
import { $, } from "../../dom";
import { feFetch, } from "../../fe-fetch";
import { showToast, } from "../../ui";
import { getErrorMessage, } from "../shared";
import type { NewChatCtx, } from "./state";

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
      const personaId = $<HTMLSelectElement>("#persona-select",)?.value || undefined;
      const impersonateId = ctx.impersonateToggle?.checked && ctx.selected.length === 1
        ? ctx.selected[0].id
        : undefined;
      const memoryCarryMode = $<HTMLInputElement>('input[name="memory_carry"]:checked',)?.value || "full";
      const memoryCarryIds = memoryCarryMode === "selective"
        ? Array.from(ctx.selectedMemoryIds,)
        : undefined;
      const templateId = $<HTMLSelectElement>("#chat-template",)?.value || undefined;
      const res = await feFetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name,
          type: ctx.chatType!.value,
          mode: $<HTMLSelectElement>("#chat-mode",)?.value,
          participantIds: Array.from(ctx.selected, (a: any,) => a.id,),
          personaId,
          impersonateActorId: impersonateId,
          memoryCarry: memoryCarryMode,
          memoryCarryIds,
          templateId,
        },),
      },);
      if (res.ok) {
        const d = await res.json();
        if (personaId) {
          feFetch(`/api/v1/chats/${d.id}/persona`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ personaId, },),
          },);
        }
        if (impersonateId) {
          feFetch(`/api/v1/chats/${d.id}/impersonate`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ impersonateActorId: impersonateId, },),
          },);
        }
        location.assign(`/views/chat?chatid=${encodeURIComponent(d.id,)}`,);
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
