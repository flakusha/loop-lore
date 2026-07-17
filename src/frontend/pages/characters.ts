// ── Characters page: search, detail modal, actions ────────────
import { jsonBody } from "../alpine/json";

declare const Alpine: { initTree: (el: Element) => void } | undefined;
declare const htmx: { trigger: (el: Element, event: string) => void } | undefined;

(globalThis as any).filterCharacters = function () {
  const query = (document.querySelector<HTMLInputElement>("#character-search")?.value ?? "")
    .toLowerCase()
    .trim();
  const cards = document.querySelectorAll("#character-grid .character-card");
  let visible = 0;
  for (const card of cards) {
    const name = (card.querySelector(".name")?.textContent ?? "").toLowerCase();
    const desc = (card.querySelector(".description")?.textContent ?? "").toLowerCase();
    const match = !query || name.includes(query) || desc.includes(query);
    (card as HTMLElement).style.display = match ? "" : "none";
    if (match) visible++;
  }
  if (visible === 0 && cards.length > 0) {
    const grid = document.querySelector("#character-grid");
    if (grid) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.padding = "var(--space-12)";
      empty.innerHTML = `<div class="icon">👤</div><div class="title">No characters match your search</div>`;
      if (!grid.querySelector(".empty-state")) grid.append(empty);
    }
  }
};

(globalThis as any).selectCharacterCard = async function (id: string) {
  let modal = document.querySelector<HTMLElement>("#character-detail-modal");

  if (!modal) {
    const container = document.querySelector("#modal-container");
    if (!container) return;
    const resp = await fetch("/partials/characters/detail-modal");
    if (!resp.ok) return;
    container.innerHTML = await resp.text();
    // Initialize Alpine on dynamically loaded modal
    if (globalThis.Alpine) {
      Alpine.initTree(container);
    }
    modal = document.querySelector<HTMLElement>("#character-detail-modal");
  }
  if (!modal) return;

  const resp = await apiFetch(`/api/actors/${id}`);
  if (!resp.ok) return;
  const char = await resp.json();

  try {
    modal.querySelector("[data-field='name']")!.textContent = char.display_name || char.name || "";
    modal.querySelector("[data-field='description']")!.textContent = char.description || "No description";
    modal.querySelector("[data-field='system-prompt']")!.textContent =
      char.system_prompt || "No system prompt";
    modal.querySelector("[data-field='avatar']")!.innerHTML = char.avatar_asset_id
      ? `<img src="/api/assets/${char.avatar_asset_id}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
      : "<span>👤</span>";
    modal.querySelector("[data-action='start-chat']")?.setAttribute("data-id", id);
    modal.querySelector("[data-action='edit-char']")?.setAttribute("data-id", id);
    modal.querySelector("[data-action='delete-char']")?.setAttribute("data-id", id);
    modal.classList.add("open");
  } catch {
    /* ignore */
  }
};

(globalThis as any).startChatFromChar = async function (btn: HTMLElement) {
  const id = btn.dataset.id;
  if (!id) return;
  try {
    const res = await apiFetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonBody({ name: "Chat", type: "direct", mode: "direct", participantIds: [id] }),
    });
    if (res.ok) {
      const data = await res.json();
      location.assign(`/views/chat?chatid=${encodeURIComponent(data.id)}`);
    }
  } catch {
    /* ignore */
  }
};

(globalThis as any).editCharacter = function (btn: HTMLElement) {
  const id = btn.dataset.id;
  if (id) location.assign(`/character/${id}/edit`);
};

(globalThis as any).deleteCharacter = async function (btn: HTMLElement) {
  const id = btn.dataset.id;
  if (!id || !confirm("Delete this character?")) return;
  try {
    const res = await apiFetch(`/api/actors/${id}`, { method: "DELETE" });
    if (res.ok) {
      document.querySelector("#character-detail-modal")?.classList.remove("open");
      showToast("success", "Character deleted");
      const grid = document.querySelector("#character-grid");
      if (grid) htmx.trigger(grid, "load");
    }
  } catch {
    /* ignore */
  }
};
