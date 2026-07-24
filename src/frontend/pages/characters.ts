// ── Characters page: search, detail modal, actions ────────────
import { jsonBody, } from "../alpine/json";
import { log as rootLog, } from "../alpine/logger";
import { fetchMood, happinessColor, moodToEmoji, moodToLabel, } from "../alpine/mood-panel";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { fetchPartial, filterCards, } from "./shared";

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

globalThis.selectCharacterCard = async function(id: string,) {
  let modal = document.querySelector<HTMLElement>("#character-detail-modal",);

  if (!modal) {
    const container = document.querySelector("#modal-container",);
    if (!container) { return; }
    const html = await fetchPartial("/partials/characters/detail-modal",);
    if (!html) { return; }
    container.innerHTML = html;
    // Initialize Alpine on dynamically loaded modal
    if (globalThis.Alpine) {
      globalThis.Alpine.initTree(container as HTMLElement,);
    }
    modal = document.querySelector<HTMLElement>("#character-detail-modal",);
  }
  if (!modal) { return; }

  const resp = await feFetch(`/api/actors/${id}`,);
  if (!resp.ok) {
    log.error("Failed to fetch actor", undefined, { status: resp.status, id, },);
    return;
  }
  const char = await resp.json();

  try {
    modal.querySelector("[data-field='name']",)!.textContent = char.display_name || char.name || "";
    modal.querySelector("[data-field='description']",)!.textContent = char.description || "No description";
    modal.querySelector("[data-field='system-prompt']",)!.textContent = char.system_prompt || "No system prompt";
    modal.querySelector("[data-field='personality']",)!.textContent = char.personality || "No personality set";
    modal.querySelector("[data-field='scenario']",)!.textContent = char.scenario || "No scenario set";
    modal.querySelector("[data-field='welcome-message']",)!.textContent = char.welcome_message || "No welcome message";
    const tagsEl = modal.querySelector<HTMLElement>("[data-field='tags']",);
    if (tagsEl) {
      const tags = char.tags ? (typeof char.tags === "string" ? JSON.parse(char.tags,) : char.tags) : [];
      tagsEl.innerHTML = Array.isArray(tags)
        ? tags.map((t: string,) => `<span style="padding:2px 8px;background:var(--bg-tertiary);border-radius:12px;font-size:0.85em">${t}</span>`,).join("")
        : "";
    }
    modal.querySelector("[data-field='avatar']",)!.innerHTML = char.avatar_asset_id
      ? `<img src="/api/assets/${char.avatar_asset_id}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
      : "<span>👤</span>";
    modal.querySelector("[data-action='start-chat']",)?.setAttribute("data-id", id,);
    modal.querySelector("[data-action='edit-char']",)?.setAttribute("data-id", id,);
    modal.querySelector("[data-action='delete-char']",)?.setAttribute("data-id", id,);
    modal.classList.add("open",);

    // Load mood data for this character
    const moodSection = modal.querySelector<HTMLElement>("[data-field='mood-section']",);
    if (moodSection) {
      const mood = await fetchMood(id,);
      if (mood) {
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
    }
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

// ── Character Edit Handlers ────────────────────────────────────

globalThis.saveCharacterEdit = async function(characterId: string,) {
  const form = document.querySelector<HTMLFormElement>("#char-edit-form",);
  if (!form) { return; }

  const name = (form.querySelector("#edit-name",) as HTMLInputElement)?.value ?? "";
  const desc = (form.querySelector("#edit-desc",) as HTMLTextAreaElement)?.value ?? "";
  const systemPrompt = (form.querySelector("#edit-system",) as HTMLTextAreaElement)?.value ?? "";
  const personality = (form.querySelector("#edit-personality",) as HTMLTextAreaElement)?.value ?? "";
  const greeting = (form.querySelector("#edit-greeting",) as HTMLTextAreaElement)?.value ?? "";
  const scenario = (form.querySelector("#edit-scenario",) as HTMLTextAreaElement)?.value ?? "";
  const mesExample = (form.querySelector("#edit-example",) as HTMLTextAreaElement)?.value ?? "";
  const postHistory = (form.querySelector("#edit-post-history",) as HTMLTextAreaElement)?.value ?? "";
  const avatarId = (form.querySelector("#char-avatar-id",) as HTMLInputElement)?.value ?? "";

  const body: Record<string, unknown> = {
    displayName: name,
    description: desc,
    systemPrompt,
    personality,
    welcomeMessage: greeting,
    scenario,
    mesExample,
    postHistoryInstructions: postHistory,
  };
  if (avatarId) { body.avatarAssetId = avatarId; }

  try {
    const resp = await feFetch(`/api/actors/${characterId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(body,),
    },);
    if (resp.ok) {
      showToast("success", "Character saved",);
      location.assign("/views/characters",);
    } else {
      showToast("error", "Failed to save character",);
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

  try {
    const resp = await fetch("/api/assets", {
      method: "POST",
      body: formData,
    },);
    if (resp.ok) {
      const data = await resp.json();
      const avatarId = data.id;
      const hiddenInput = document.querySelector<HTMLInputElement>("#char-avatar-id",);
      if (hiddenInput) { hiddenInput.value = avatarId; }
      const preview = document.querySelector("#avatar-preview",);
      if (preview) {
        preview.innerHTML = `<img src="/api/assets/${avatarId}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`;
      }
      const label = document.querySelector("#upload-avatar-label",);
      if (label) { label.textContent = "Replace Avatar"; }
    }
  } catch {
    showToast("error", "Failed to upload avatar",);
  }
};

globalThis.clearAvatar = function() {
  const hiddenInput = document.querySelector<HTMLInputElement>("#char-avatar-id",);
  if (hiddenInput) { hiddenInput.value = ""; }
  const preview = document.querySelector("#avatar-preview",);
  if (preview) { preview.innerHTML = "<span>👤</span>"; }
};
