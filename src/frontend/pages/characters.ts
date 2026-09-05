// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Characters page: search, detail modal, actions ────────────
import { jsonBody, } from "../alpine/json";
import { log as rootLog, } from "../alpine/logger";
import { fetchMood, happinessColor, moodToEmoji, moodToLabel, } from "../alpine/mood-panel";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { escapeHtml, fetchPartial, filterCards, } from "./shared";

// Initialize traits + proactive messaging modules
import { initProactive, } from "./characters-proactive";
import "./characters-edit-form";
import { initTraits, } from "./characters-traits";
import "../character-growth-editor";

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

/**
 * Fill modal with character data and mood.
 * @param modal
 * @param char
 * @param id
 */
async function populateModal(modal: HTMLElement, char: Record<string, unknown>, id: string,): Promise<void> {
  modal.querySelector("[data-field='name']",)!.textContent = (char.display_name || char.name || "") as string;
  modal.querySelector("[data-field='description']",)!.textContent = (char.description || "No description") as string;
  modal.querySelector("[data-field='system-prompt']",)!.textContent =
    (char.system_prompt || "No system prompt") as string;
  const avatarId = char.avatar_asset_id as string | undefined;
  modal.querySelector("[data-field='avatar']",)!.innerHTML = avatarId
    ? `<img src="/api/assets/${
      escapeHtml(avatarId,)
    }/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
    : "<span>👤</span>";
  modal.querySelector("[data-action='start-chat']",)?.setAttribute("data-id", id,);
  modal.querySelector("[data-action='edit-char']",)?.setAttribute("data-id", id,);
  modal.querySelector("[data-action='delete-char']",)?.setAttribute("data-id", id,);
  modal.classList.add("open",);
  await loadCharacterGallery(modal, id,);

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

/**
 * Load the character's linked gallery assets (avatars) into the modal's Gallery tab.
 * @param modal
 * @param id
 */
async function loadCharacterGallery(modal: HTMLElement, id: string,): Promise<void> {
  const container = modal.querySelector<HTMLElement>("[data-field='gallery']",);
  if (!container) { return; }
  try {
    const resp = await feFetch(`/api/actors/${id}/avatars`,);
    if (!resp.ok) {
      container.innerHTML = "<div data-field='gallery-empty'>Failed to load gallery.</div>";
      return;
    }
    const avatars = await resp.json() as Array<{ id: string; assetId: string; label: string }>;
    if (!Array.isArray(avatars,) || avatars.length === 0) {
      container.innerHTML = "<div data-field='gallery-empty'>No linked assets.</div>";
      return;
    }
    container.innerHTML = Array.from(
      avatars,
      (av,) =>
        `<div class="avatar-gallery-item" style="display:flex;flex-direction:column;align-items:center;gap:var(--space-1)">
      <div style="width:56px;height:56px;border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-tertiary);border:1px solid var(--border-default)">
        <img src="/api/assets/${escapeHtml(av.assetId,)}/thumb" alt="${
          escapeHtml(av.label || "avatar",)
        }" style="width:100%;height:100%;object-fit:cover" />
      </div>
      <span style="font-size:var(--fs-base-xs);color:var(--text-secondary);max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${
          escapeHtml(av.label || "",)
        }</span>
      <button class="btn btn-ghost btn-sm" data-action="unlink-asset" data-asset-id="${
          escapeHtml(av.assetId,)
        }" data-actor-id="${
          escapeHtml(id,)
        }" x-on:click="window.unlinkCharacterAsset($el)" title="Unlink from character">✕ Unlink</button>
    </div>`,
    ).join("",);
  } catch {
    container.innerHTML = "<div data-field='gallery-empty'>Failed to load gallery.</div>";
  }
}

globalThis.unlinkCharacterAsset = async function(btn: HTMLElement,) {
  const actorId = btn.dataset.actorId;
  const assetId = btn.dataset.assetId;
  const modal = btn.closest("#character-detail-modal",) as HTMLElement | null;
  if (!actorId || !assetId || !modal) { return; }
  try {
    const res = await feFetch(`/api/actors/${actorId}/assets/${assetId}`, {
      method: "DELETE",
    },);
    if (res.ok) {
      showToast("success", "Asset unlinked",);
      await loadCharacterGallery(modal, actorId,);
    } else {
      showToast("error", "Failed to unlink asset",);
    }
  } catch {
    showToast("error", "Failed to unlink asset",);
  }
};

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
  // The export modal partial does not carry data-character-id itself, but it
  // is rendered inside a context that does (e.g. #character-chat-list,
  // #character-edit-form, or the grid). Walk up to the nearest ancestor with
  // the attribute. Fall back to the modal element for callers that set it
  // explicitly. Fix for BUG-character-export-broken-export-modal-missing-data-character-id.
  const modal = btn.closest(".modal",);
  if (!modal) {
    log.error("No modal found",);
    return;
  }

  const format = (
    modal.querySelector('input[name="export-format"]:checked',) as HTMLInputElement | null
  )?.value;
  const characterId = btn.closest("[data-character-id]",)?.getAttribute("data-character-id",) ??
    (modal as HTMLElement).dataset.characterId;

  if (!characterId) {
    log.error("No character ID found",);
    return;
  }

  // Trigger download - backend uses /api/actors/:actorId/export
  globalThis.location.assign(`/api/actors/${characterId}/export?format=${format}`,);
  closeModal(btn,);
};

initTraits(feFetch,);
initProactive(feFetch,);
