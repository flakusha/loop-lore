// ── Characters page: search, detail modal, actions ────────────
import { jsonBody, } from "../alpine/json";
import { log as rootLog, } from "../alpine/logger";
import { fetchMood, happinessColor, moodToEmoji, moodToLabel, } from "../alpine/mood-panel";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { fetchPartial, filterCards, } from "./shared";

// Initialize traits + proactive messaging modules
import { initProactive, } from "./characters-proactive";
import { initTraits, } from "./characters-traits";

const log = rootLog.child({ module: "characters-page", },);

globalThis.filterCharacters = function() {
  const query = document.querySelector<HTMLInputElement>("#character-search",)?.value ?? "";
  filterCards({
    containerId: "#character-grid",
    cardSelector: ".character-card",
    nameSelector: ".name",
    descSelector: ".description",
    query,
    emptyIcon: "👤",
    emptyTitle: "No characters match your search",
  },);
};

/** Lazy-init the character detail modal; returns null if unavailable. */
async function ensureModal(): Promise<HTMLElement | null> {
  const existing = document.querySelector<HTMLElement>("#character-detail-modal",);
  if (existing) { return existing; }

  const container = document.querySelector("#modal-container",);
  if (!container) { return null; }
  const html = await fetchPartial("/partials/characters/detail-modal",);
  if (!html) { return null; }
  container.innerHTML = html;
  if (globalThis.Alpine) { globalThis.Alpine.initTree(container as HTMLElement,); }
  return document.querySelector<HTMLElement>("#character-detail-modal",);
}

/** Fill modal with character data and mood. */
async function populateModal(modal: HTMLElement, char: Record<string, unknown>, id: string,): Promise<void> {
  modal.querySelector("[data-field='name']",)!.textContent = (char.display_name || char.name || "") as string;
  modal.querySelector("[data-field='description']",)!.textContent = (char.description || "No description") as string;
  modal.querySelector("[data-field='system-prompt']",)!.textContent =
    (char.system_prompt || "No system prompt") as string;
  const avatarId = char.avatar_asset_id as string | undefined;
  modal.querySelector("[data-field='avatar']",)!.innerHTML = avatarId
    ? `<img src="/api/assets/${avatarId}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
    : "<span>👤</span>";
  modal.querySelector("[data-action='start-chat']",)?.setAttribute("data-id", id,);
  modal.querySelector("[data-action='edit-char']",)?.setAttribute("data-id", id,);
  modal.querySelector("[data-action='delete-char']",)?.setAttribute("data-id", id,);
  modal.classList.add("open",);

  const moodSection = modal.querySelector<HTMLElement>("[data-field='mood-section']",);
  if (!moodSection) { return; }
  const mood = await fetchMood(id,);
  if (!mood) { return; }
  moodSection.style.display = "block";
  const emojiEl = modal.querySelector<HTMLElement>("[data-field='mood-emoji']",);
  const labelEl = modal.querySelector<HTMLElement>("[data-field='mood-label']",);
  const barEl = modal.querySelector<HTMLElement>("[data-field='mood-bar']",);
  const happinessEl = modal.querySelector<HTMLElement>("[data-field='mood-happiness']",);
  if (emojiEl) { emojiEl.textContent = moodToEmoji(mood.currentMood,); }
  if (labelEl) { labelEl.textContent = moodToLabel(mood.currentMood,); }
  if (barEl) {
    barEl.style.width = `${mood.happiness}%`;
    barEl.style.backgroundColor = happinessColor(mood.happiness,);
  }
  if (happinessEl) { happinessEl.textContent = `${mood.happiness}%`; }
}

globalThis.selectCharacterCard = async function(id: string,) {
  const modal = await ensureModal();
  if (!modal) { return; }

  const resp = await feFetch(`/api/actors/${id}`,);
  if (!resp.ok) {
    log.error("Failed to fetch actor", undefined, { status: resp.status, id, },);
    return;
  }
  const char = await resp.json();

  try {
    await populateModal(modal, char, id,);
  } catch {
    /* ignore */
  }
};

globalThis.startChatFromChar = async function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (!id) { return; }
  try {
    const res = await feFetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ name: "Chat", type: "direct", mode: "direct", participantIds: [id,], },),
    },);
    if (res.ok) {
      const data = await res.json();
      location.assign(`/views/chat?chatid=${encodeURIComponent(data.id,)}`,);
    }
  } catch {
    /* ignore */
  }
};

globalThis.editCharacter = function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (id) { location.assign(`/character/${id}/edit`,); }
};

globalThis.deleteCharacter = async function(btn: HTMLElement,) {
  const id = btn.dataset.id;
  if (!id || !confirm("Delete this character?",)) { return; }
  try {
    const res = await feFetch(`/api/actors/${id}`, {
      method: "DELETE",
    },);
    if (res.ok) {
      document.querySelector("#character-detail-modal",)?.classList.remove("open",);
      showToast("success", "Character deleted",);
      const grid = document.querySelector("#character-grid",);
      if (grid) {
        htmx.trigger(grid, "load",);
      }
    }
  } catch {
    /* ignore */
  }
};

globalThis.exportCharacter = function(btn: HTMLElement,) {
  const modal = btn.closest(".modal",);
  if (!modal) {
    log.error("No modal found",);
    return;
  }

  const format = (
    modal.querySelector('input[name="export-format"]:checked',) as HTMLInputElement | null
  )?.value;
  const characterId = (modal as HTMLElement).dataset.characterId;

  if (!characterId) {
    log.error("No character ID found",);
    return;
  }

  // Trigger download — backend uses /api/actors/:actorId/export
  globalThis.location.assign(`/api/actors/${characterId}/export?format=${format}`,);
  closeModal(btn,);
};

// ── Character edit form (served at /character/:id/edit) ────────────
// Wire the edit form's Save / Upload Avatar / Remove buttons, which were
// declared in loaders.d.ts but never implemented. Fields mirror the fields
// serveCharacterEditForm renders; the PUT contract is ActorUpdateBody.

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
      preview.innerHTML =
        `<img src="/api/assets/${asset.id}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`;
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

initTraits(feFetch,);
initProactive(feFetch,);
