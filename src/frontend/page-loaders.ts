import { log } from "./alpine/logger";

const pageLog = log.child({ module: "pages" });

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// ── DOM-level search/filter (work on server-rendered content) ──

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

(globalThis as any).filterAssets = function () {
  const query = (document.querySelector<HTMLInputElement>("#asset-search")?.value ?? "").toLowerCase().trim();
  const type = document.querySelector<HTMLSelectElement>("#asset-type-filter")?.value ?? "all";
  const cards = document.querySelectorAll("#asset-grid .asset-card");
  let visible = 0;
  for (const card of cards) {
    const name = (card.querySelector(".name")?.textContent ?? "").toLowerCase();
    const mime = (card.querySelector(".type")?.textContent ?? "").toLowerCase();
    const matchesQuery = !query || name.includes(query) || mime.includes(query);
    const matchesType =
      type === "all" ||
      (card.querySelector(".file-icon")?.textContent === "🎵" && type === "audio") ||
      (card.querySelector(".file-icon")?.textContent === "🎬" && type === "video") ||
      (card.querySelector("img") && type === "image");
    (card as HTMLElement).style.display = matchesQuery && matchesType ? "" : "none";
    if (matchesQuery && matchesType) visible++;
  }
  if (visible === 0 && cards.length > 0) {
    const grid = document.querySelector("#asset-grid");
    if (grid) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.gridColumn = "1 / -1";
      empty.innerHTML = `<div class="icon">📁</div><div class="title">No assets match your filters</div>`;
      if (!grid.querySelector(".empty-state")) grid.append(empty);
    }
  }
};

(globalThis as any).filterWorlds = function () {
  const query = (document.querySelector<HTMLInputElement>("#world-search")?.value ?? "").toLowerCase().trim();
  const cards = document.querySelectorAll("#world-list .world-card");
  let visible = 0;
  for (const card of cards) {
    const name = (card.querySelector(".world-name")?.textContent ?? "").toLowerCase();
    const desc = (card.querySelector(".world-description")?.textContent ?? "").toLowerCase();
    const match = !query || name.includes(query) || desc.includes(query);
    (card as HTMLElement).style.display = match ? "" : "none";
    if (match) visible++;
  }
  if (visible === 0 && cards.length > 0) {
    const list = document.querySelector("#world-list");
    if (list) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.style.padding = "var(--space-12)";
      empty.innerHTML = `<div class="icon">🌍</div><div class="title">No worlds match your search</div>`;
      if (!list.querySelector(".empty-state")) list.append(empty);
    }
  }
};

// ── Characters: detail modal + actions ────────────────────────

(globalThis as any).selectCharacterCard = async function (id: string) {
  let modal = document.querySelector<HTMLElement>("#character-detail-modal");

  // Lazy-load detail modal if not in DOM yet
  if (!modal) {
    const container = document.querySelector("#modal-container");
    if (!container) return;
    container.innerHTML =
      '<div id="character-detail-modal" class="modal-overlay" x-on:click="window.closeModalOnBackdrop($event)" data-testid="character-detail-modal"><div class="modal"></div></div>';
    const resp = await fetch("/partials/characters/detail-modal");
    if (resp.ok) {
      container.innerHTML = await resp.text();
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
      body: JSON.stringify({ name: "Chat", type: "direct", mode: "direct", participantIds: [id] }),
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

// ── Gallery: preview modal + actions ───────────────────────────

(globalThis as any).openAssetPreview = async function (id: string) {
  pageLog.debug("openAssetPreview", { id });
  try {
    const res = await apiFetch(`/api/assets/${id}`);
    if (!res.ok) return;
    const a = await res.json();
    (globalThis as any).__previewAsset = a;
    const modal = document.querySelector<HTMLElement>("#preview-modal");
    if (!modal) return;
    modal.querySelector("[data-field='filename']")!.textContent = a.filename || "Asset";
    modal.querySelector("[data-field='mime']")!.textContent = a.mime_type || "";
    modal.querySelector("[data-field='size']")!.textContent = formatSize(a.size_bytes);
    const body = modal.querySelector("[data-field='preview-body']")!;
    switch (a.asset_type) {
      case "image": {
        body.innerHTML = `<img src="/api/assets/${a.id}/raw" alt="${escapeHtml(a.filename)}" style="width:100%;display:block" />`;
        break;
      }
      case "audio": {
        body.innerHTML = `<audio controls style="width:100%;padding:var(--space-6)"><source src="/api/assets/${a.id}/raw" /></audio>`;
        break;
      }
      case "video": {
        body.innerHTML = `<video controls style="width:100%;display:block"><source src="/api/assets/${a.id}/raw" /></video>`;
        break;
      }
      default: {
        body.innerHTML = `<div style="padding:var(--space-6);text-align:center"><div class="file-icon" style="font-size:48px">📄</div></div>`;
      }
    }
    modal.classList.add("open");
  } catch {
    /* ignore */
  }
};

(globalThis as any).copyAssetUrl = async function () {
  const a = (globalThis as any).__previewAsset;
  if (!a?.id) return;
  try {
    await navigator.clipboard.writeText(`${location.origin}/api/assets/${a.id}/raw`);
    showToast("success", "URL copied");
  } catch {
    showToast("error", "Failed to copy");
  }
};

(globalThis as any).downloadAsset = function () {
  const a = (globalThis as any).__previewAsset;
  if (!a?.id) return;
  const el = document.createElement("a");
  el.href = `/api/assets/${a.id}/raw`;
  el.download = a.filename || "asset";
  el.click();
};

(globalThis as any).deleteAssetPreview = async function () {
  const a = (globalThis as any).__previewAsset;
  if (!a?.id || !confirm("Delete this asset?")) return;
  try {
    const res = await apiFetch(`/api/assets/${a.id}`, { method: "DELETE" });
    if (res.ok) {
      document.querySelector("#preview-modal")?.classList.remove("open");
      (globalThis as any).__previewAsset = null;
      showToast("success", "Asset deleted");
      const grid = document.querySelector("#asset-grid");
      if (grid) htmx.trigger(grid, "load");
    }
  } catch {
    showToast("error", "Failed to delete");
  }
};

// ── Worlds: create ────────────────────────────────────────────

(globalThis as any).createWorld = async function (event: Event) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const data: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  pageLog.debug("createWorld", { data });
  try {
    const res = await apiFetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    pageLog.debug("createWorld response", { status: res.status });
    if (res.ok) {
      const data = await res.json();
      document.querySelector("#create-world-modal")?.classList.remove("open");
      showToast("success", "World created");
      location.assign(`/worlds/${data.id}/edit`);
    } else {
      const err = await res.json();
      showToast("error", err.error || "Failed to create world");
    }
  } catch {
    showToast("error", "Network error");
  }
};

// ── Character edit: save + avatar ──────────────────────────────

(globalThis as any).saveCharacterEdit = async function (id: string): Promise<void> {
  const body = {
    displayName: (document.querySelector("#edit-name") as HTMLInputElement)?.value,
    description: (document.querySelector("#edit-desc") as HTMLTextAreaElement)?.value,
    systemPrompt: (document.querySelector("#edit-system") as HTMLTextAreaElement)?.value,
    personality: (document.querySelector("#edit-personality") as HTMLTextAreaElement)?.value,
    welcomeMessage: (document.querySelector("#edit-greeting") as HTMLTextAreaElement)?.value,
    scenario: (document.querySelector("#edit-scenario") as HTMLTextAreaElement)?.value,
    mesExample: (document.querySelector("#edit-example") as HTMLTextAreaElement)?.value,
    postHistoryInstructions: (document.querySelector("#edit-post-history") as HTMLTextAreaElement)?.value,
    avatarAssetId: (document.querySelector("#char-avatar-id") as HTMLInputElement)?.value || null,
  };
  try {
    const btn = document.querySelector<HTMLElement>('[data-testid="save-character-btn"]');
    if (btn) {
      btn.textContent = "Saving...";
      (btn as HTMLButtonElement).disabled = true;
    }
    const res = await apiFetch(`/api/actors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      showToast("success", "Character saved");
      location.assign("/views/characters");
    } else {
      const err = await res.json();
      showToast("error", err.error || "Failed to save");
    }
  } catch {
    showToast("error", "Network error");
  }
};

(globalThis as any).uploadAvatar = async function (input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  if (!file) return;
  const label = document.querySelector("#upload-avatar-label");
  if (label) label.textContent = "Uploading...";
  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("alt_text", "Avatar");
    const r = await apiFetch("/api/assets", { method: "POST", body: fd });
    if (r.ok) {
      const a = await r.json();
      document.querySelector("#avatar-preview")!.innerHTML =
        '<img src="/api/assets/' +
        a.id +
        '/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />';
      (document.querySelector("#char-avatar-id") as HTMLInputElement)!.value = a.id;
      showToast("success", "Avatar uploaded");
    } else {
      showToast("error", "Upload failed");
    }
  } catch {
    showToast("error", "Upload failed");
  }
  if (label) label.textContent = "Upload Avatar";
};

(globalThis as any).clearAvatar = function (): void {
  document.querySelector("#avatar-preview")!.innerHTML = "<span>👤</span>";
  (document.querySelector("#char-avatar-id") as HTMLInputElement)!.value = "";
};

// ── New chat page (still JS-driven) ────────────────────────────

(globalThis as any).loadNewChatPage = async function (): Promise<void> {
  let actors: any[] = [];
  let selected: any[] = [];

  try {
    const res = await apiFetch("/api/actors?pageSize=200");
    const data = await res.json();
    actors = (data.data || []).filter((a: any) => a.actor_type !== "user");
  } catch {
    /* ignore */
  }

  try {
    const res = await apiFetch("/api/personas");
    const personas = await res.json();
    const personaSelect = document.querySelector("#persona-select") as HTMLSelectElement | null;
    if (personaSelect && Array.isArray(personas)) {
      for (const p of personas) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.is_default) opt.selected = true;
        personaSelect.append(opt);
      }
    }
  } catch {
    /* ignore */
  }

  const searchInput = document.querySelector("#participant-search") as HTMLInputElement | null;
  const resultsEl = document.querySelector<HTMLElement>("#participant-results");
  const selectedEl = document.querySelector("#selected-participants");
  const chatType = document.querySelector("#chat-type") as HTMLSelectElement | null;
  const form = document.querySelector("#create-chat-form");

  if (!searchInput || !resultsEl || !selectedEl || !chatType || !form) return;

  const impersonateGroup = document.querySelector("#impersonate-group") as HTMLElement | null;
  const impersonateToggle = document.querySelector("#impersonate-toggle") as HTMLInputElement | null;

  const isGroup = () => chatType.value === "group";

  function renderSelected() {
    if (!selectedEl) return;
    selectedEl.innerHTML = selected
      .map(
        (a: any) =>
          `<span style="display:inline-flex;align-items:center;gap:var(--space-1);padding:2px var(--space-2);background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:13px">
        ${escapeHtml(a.display_name || a.name || "Unknown")}
        <button type="button" class="btn-icon" style="font-size:14px;width:18px;height:18px" data-id="${a.id}" onclick="removeParticipant('${a.id}')">&times;</button>
      </span>`,
      )
      .join("");
  }

  (globalThis as any).removeParticipant = function (id: string) {
    selected = selected.filter((a: any) => a.id !== id);
    renderSelected();
    if (resultsEl) resultsEl.style.display = "none";
    if (impersonateGroup && impersonateToggle) {
      impersonateGroup.style.display = selected.length === 1 ? "" : "none";
      if (selected.length !== 1) impersonateToggle.checked = false;
    }
  };

  function selectActor(actor: any) {
    if (isGroup()) {
      if (selected.every((a: any) => a.id !== actor.id)) selected.push(actor);
    } else {
      selected = [actor];
    }
    renderSelected();
    if (searchInput) searchInput.value = "";
    if (resultsEl) resultsEl.style.display = "none";
    if (impersonateGroup && impersonateToggle) {
      impersonateGroup.style.display = selected.length === 1 ? "" : "none";
      if (selected.length !== 1) impersonateToggle.checked = false;
    }
  }

  (globalThis as any).selectActorFromList = function (id: string) {
    const actor = actors.find((a: any) => a.id === id);
    if (actor) selectActor(actor);
  };

  function renderResults(filtered: any[]) {
    if (!resultsEl) return;
    resultsEl.innerHTML =
      filtered.length === 0
        ? '<div style="padding:var(--space-3);color:var(--text-secondary);font-size:13px;text-align:center">No characters found</div>'
        : filtered
            .map((a: any) => {
              const disabled = isGroup() && selected.find((s: any) => s.id === a.id);
              const onclickAttr = disabled ? "" : `onclick="selectActorFromList('${a.id}')"`;
              return `<div style="padding:var(--space-2) var(--space-3);cursor:pointer;display:flex;align-items:center;gap:var(--space-2);${disabled ? "opacity:0.4;cursor:default" : ""}" ${onclickAttr} onmouseenter="this.style.background='var(--bg-tertiary)'" onmouseleave="this.style.background=''">
          <span style="font-size:16px">${a.avatar_asset_id ? "" : "👤"}</span>
          <div>
            <div style="font-size:14px;font-weight:500">${escapeHtml(a.display_name || a.name || "Unknown")}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${escapeHtml((a.description || "").slice(0, 60))}</div>
          </div>
          ${disabled ? '<span style="margin-left:auto;font-size:12px;color:var(--text-secondary)">added</span>' : ""}
        </div>`;
            })
            .join("");
    resultsEl.style.display = "block";
  }

  searchInput.addEventListener("input", function () {
    const q = this.value.toLowerCase().trim();
    if (!q) {
      if (resultsEl) resultsEl.style.display = "none";
      return;
    }
    const filtered = actors
      .filter((a: any) => {
        const name = (a.display_name || a.name || "").toLowerCase();
        const desc = (a.description || "").toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
      .slice(0, 20);
    renderResults(filtered);
  });

  searchInput.addEventListener("blur", function () {
    setTimeout(() => {
      if (resultsEl) resultsEl.style.display = "none";
    }, 200);
  });

  searchInput.addEventListener("focus", function () {
    if (!this.value.trim()) return;
    const q = this.value.toLowerCase().trim();
    const filtered = actors
      .filter((a: any) => {
        const name = (a.display_name || a.name || "").toLowerCase();
        const desc = (a.description || "").toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
      .slice(0, 20);
    renderResults(filtered);
  });

  form.addEventListener("submit", async function (e: Event) {
    e.preventDefault();
    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]');
    if (!nameInput) return;
    const name = nameInput.value.trim();
    if (!name) return;

    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Creating...";
    }

    try {
      const personaId = (document.querySelector("#persona-select") as HTMLSelectElement)?.value || undefined;
      const impersonateId = impersonateToggle?.checked && selected.length === 1 ? selected[0].id : undefined;
      const res = await apiFetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: chatType.value,
          mode: (document.querySelector("#chat-mode") as HTMLSelectElement)?.value,
          participantIds: selected.map((a: any) => a.id),
          personaId,
          impersonateActorId: impersonateId,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        if (personaId) {
          apiFetch("/api/chats/" + d.id + "/persona", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ personaId }),
          });
        }
        if (impersonateId) {
          apiFetch("/api/chats/" + d.id + "/impersonate", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ impersonateActorId: impersonateId }),
          });
        }
        location.assign("/views/chat?chatid=" + encodeURIComponent(d.id));
      } else {
        let err: Record<string, string>;
        try {
          err = await res.json();
        } catch {
          err = {};
        }
        showToast("error", err.error || "Failed to create chat");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Create Chat";
        }
      }
    } catch {
      showToast("error", "Network error");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Create Chat";
      }
    }
  });
};

// ── Settings page (still JS-driven) ────────────────────────────

(globalThis as any).loadSettingsPage = function (): void {
  const themeSel = document.querySelector<HTMLSelectElement>('[data-testid="theme-select"]');
  if (themeSel) themeSel.value = localStorage.getItem("theme-preference") || "default";
  const localeSel = document.querySelector<HTMLSelectElement>('[data-testid="locale-select"]');
  if (localeSel) localeSel.value = localStorage.getItem("locale") || "en";
  const prov = document.querySelector<HTMLSelectElement>('[data-testid="api-provider"]');
  if (prov) {
    prov.addEventListener("change", function () {
      const group = document.querySelector<HTMLElement>("#api-endpoint-group");
      if (group) group.style.display = this.value === "Custom" ? "block" : "none";
    });
  }

  const lsToggles: Array<[string, string]> = [
    ["enterToSend", "#enter-to-send"],
    ["autoScroll", "#auto-scroll"],
    ["inlinePreview", "#inline-preview"],
  ];
  for (const [storageKey, selector] of lsToggles) {
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) {
      el.checked = localStorage.getItem(storageKey) !== "false";
      el.addEventListener("change", () => localStorage.setItem(storageKey, String(el.checked)));
    }
  }
  const detailEl = document.querySelector<HTMLSelectElement>("#detail-level");
  if (detailEl) {
    detailEl.value = localStorage.getItem("detailLevel") || "Immersion";
    detailEl.addEventListener("change", () => localStorage.setItem("detailLevel", detailEl.value));
  }

  const tempSlider = document.querySelector<HTMLInputElement>('[data-testid="temp-slider"]');
  const tempVal = document.querySelector("#temp-value");
  if (tempSlider && tempVal) {
    tempSlider.addEventListener("input", () => {
      tempVal.textContent = tempSlider.value;
    });
  }

  const confirmInput = document.querySelector<HTMLInputElement>("#confirm-delete-input");
  const confirmBtn = document.querySelector<HTMLButtonElement>("#delete-all-btn");
  if (confirmInput && confirmBtn) {
    confirmInput.addEventListener("input", () => {
      confirmBtn.disabled = confirmInput.value !== "DELETE";
    });
  }

  document
    .querySelector("[data-action='clear-api-key']")
    ?.addEventListener("click", function (this: HTMLElement) {
      const input = this.previousElementSibling as HTMLInputElement | null;
      if (input) input.value = "";
    });
};
