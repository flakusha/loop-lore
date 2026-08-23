// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character edit form (served at /character/:id/edit) ────────────
// Wire the edit form's Save / Upload Avatar / Remove buttons, which were
// declared in loaders.d.ts but never implemented. Fields mirror the fields
// serveCharacterEditForm renders; the PUT contract is ActorUpdateBody.

import { jsonBody, } from "../alpine/json";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { escapeHtml, } from "./shared";

function editField(id: string,): string {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`,)?.value ?? "";
}

globalThis.saveCharacterEdit = async function(characterId: string,) {
  const body = jsonBody({
    displayName: editField("edit-name",),
    description: editField("edit-desc",),
    systemPrompt: editField("edit-system",),
    personality: editField("edit-personality",),
    welcomeMessage: editField("edit-greeting",),
    scenario: editField("edit-scenario",),
    mesExample: editField("edit-example",),
    postHistoryInstructions: editField("edit-post-history",),
    // avatarAssetId: null clears the avatar; the hidden input holds the
    // latest uploaded id OR empty string when removed.
    avatarAssetId: editField("char-avatar-id",) || null,
    // 5-tier NSFW content rating; unchanged when the selector is absent.
    contentRating: editField("edit-content-rating",) || undefined,
  },);
  try {
    const res = await feFetch(`/api/actors/${characterId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body,
    },);
    if (res.ok) {
      // Save internal traits in parallel
      const saveTraits = (globalThis as Record<string, unknown>).saveInternalTraits;
      if (typeof saveTraits === "function") {
        await saveTraits(characterId,);
      }
      // Save proactive messaging config (when inside a chat context)
      const saveProactive = (globalThis as Record<string, unknown>).saveProactiveConfig;
      if (typeof saveProactive === "function") {
        await saveProactive(characterId,);
      }
      showToast("success", "Character saved",);
      location.assign("/views/characters",);
    } else {
      let message = "Failed to save character";
      try {
        const data = await res.json();
        message = data?.message ?? message;
      } catch {
        /* keep default message */
      }
      showToast("error", message,);
    }
  } catch {
    showToast("error", "Failed to save character",);
  }
};

globalThis.uploadAvatar = async function(input: HTMLInputElement,) {
  const file = input.files?.[0];
  if (!file) { return; }
  const formData = new FormData();
  formData.append("file", file,);
  formData.append("alt_text", file.name,);
  try {
    const res = await feFetch("/api/assets", { method: "POST", body: formData, },);
    if (!res.ok) {
      showToast("error", "Avatar upload failed",);
      return;
    }
    const asset = await res.json();
    const avatarInput = document.querySelector<HTMLInputElement>("#char-avatar-id",);
    if (avatarInput) { avatarInput.value = asset.id; }
    const preview = document.querySelector("#avatar-preview",);
    if (preview) {
      preview.innerHTML = `<img src="/api/assets/${
        escapeHtml(asset.id,)
      }/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`;
    }
    showToast("success", "Avatar uploaded — save to apply",);
  } catch {
    showToast("error", "Avatar upload failed",);
  }
};

globalThis.clearAvatar = function() {
  const hidden = document.querySelector<HTMLInputElement>("#char-avatar-id",);
  if (hidden) { hidden.value = ""; }
  const preview = document.querySelector("#avatar-preview",);
  if (preview) { preview.innerHTML = "<span>👤</span>"; }
  showToast("info", "Avatar cleared — save to apply",);
};
