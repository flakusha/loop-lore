import { log } from "./alpine/logger";

const pageLog = log.child({ module: "pages" });

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(s: string): string {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function formatTimeAgo(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Search/filter state (fast-gain UX) ───────────────────
const characterData: any[] = [];
const assetData: any[] = [];
const worldData: any[] = [];

/** Case-insensitive substring match across the given fields. */
function matchesQuery(item: any, query: string, fields: string[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some((f) =>
    String(item[f] ?? "")
      .toLowerCase()
      .includes(q),
  );
}

// ── Characters page ─────────────────────────────────────────

(globalThis as any).loadCharactersPage = async function () {
  pageLog.debug("loadCharactersPage");
  const grid = document.querySelector("#character-grid");
  if (!grid) return;
  try {
    const res = await apiFetch("/api/actors?pageSize=100");
    const data = await res.json();
    const chars = (data.data || []).filter((c: any) => c.actor_type !== "user");
    characterData.length = 0;
    characterData.push(...chars);
    renderCharacters();
  } catch {
    /* ignore */
  }
};

function renderCharacters(): void {
  const grid = document.querySelector("#character-grid");
  if (!grid) return;
  const query = (document.querySelector<HTMLInputElement>("#character-search")?.value ?? "").trim();
  const filtered = characterData
    .filter((c: any) => matchesQuery(c, query, ["display_name", "description"]))
    .sort((a: any, b: any) => String(a.display_name ?? "").localeCompare(String(b.display_name ?? "")));
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="padding: var(--space-12)" data-testid="characters-empty">
      <div class="icon">👤</div><div class="title">No characters found</div>
      <div class="description">${query ? "No matches for your search." : "Create your first character to start roleplaying."}</div>
    </div>`;
    return;
  }
  grid.innerHTML = filtered
    .map((char: any) => {
      const avatar = char.avatar_asset_id
        ? `<img src="/api/assets/${char.avatar_asset_id}/thumb" alt="Avatar" />`
        : "<span>👤</span>";
      return `<div class="character-card" onclick="selectCharacterCard('${char.id}')" data-testid="character-card-${char.id}">
      <div class="card-img">${avatar}</div>
      <div class="card-body">
        <div class="name">${escapeHtml(char.display_name || "")}</div>
        <div class="description">${escapeHtml(char.description || "No description")}</div>
      </div>
      </div>`;
    })
    .join("");
}

(globalThis as any).filterCharacters = function () {
  renderCharacters();
};

(globalThis as any).selectCharacterCard = async function (id: string) {
  try {
    const res = await apiFetch(`/api/actors/${id}`);
    if (!res.ok) return;
    const char = await res.json();
    const modal = document.querySelector<HTMLElement>("#character-detail-modal");
    if (!modal) return;
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

// ── Characters action handlers ─────────────────────────────

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
      (globalThis as any).loadCharactersPage();
    }
  } catch {
    /* ignore */
  }
};

// ── Gallery page ───────────────────────────────────────────

function thumbForAsset(a: any): string {
  switch (a.asset_type) {
    case "image": {
      return `<img src="/api/assets/${a.id}/thumb" alt="${escapeHtml(a.filename)}" loading="lazy" />`;
    }
    case "audio": {
      return `<div class="file-icon">🎵</div>`;
    }
    case "video": {
      return `<div class="file-icon">🎬</div>`;
    }
    default: {
      return `<div class="file-icon">📄</div>`;
    }
  }
}

(globalThis as any).loadGalleryPage = async function () {
  pageLog.debug("loadGalleryPage");
  const grid = document.querySelector("#asset-grid");
  if (!grid) return;
  try {
    const res = await apiFetch("/api/assets?pageSize=200");
    const data = await res.json();
    const assets = data.data || [];
    assetData.length = 0;
    assetData.push(...assets);
    renderAssets();
  } catch {
    /* ignore */
  }
};

function renderAssets(): void {
  const grid = document.querySelector("#asset-grid");
  if (!grid) return;
  const query = (document.querySelector<HTMLInputElement>("#asset-search")?.value ?? "").trim();
  const type = document.querySelector<HTMLSelectElement>("#asset-type-filter")?.value ?? "all";
  let filtered = assetData.filter(
    (a: any) =>
      matchesQuery(a, query, ["filename", "mime_type"]) && (type === "all" || a.asset_type === type),
  );
  filtered = filtered.sort((a: any, b: any) =>
    String(a.filename ?? "").localeCompare(String(b.filename ?? "")),
  );
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div><div class="title">No assets found</div>
      <div class="description">${query || type !== "all" ? "No matches for your filters." : "Upload images, audio, or video to get started."}</div>
    </div>`;
    return;
  }
  grid.innerHTML = filtered
    .map(
      (a: any) =>
        `<div class="asset-card" onclick="openAssetPreview('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a)}</div>
      <div class="details">
        <span class="name">${escapeHtml(a.filename)}</span>
        <span class="type">${formatSize(a.size_bytes)}</span>
      </div>
    </div>`,
    )
    .join("");
}

(globalThis as any).filterAssets = function () {
  renderAssets();
};

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
      (globalThis as any).loadGalleryPage();
    }
  } catch {
    showToast("error", "Failed to delete");
  }
};

// ── Worlds page ────────────────────────────────────────────

(globalThis as any).loadWorldsPage = async function () {
  pageLog.debug("loadWorldsPage");
  const list = document.querySelector("#world-list");
  if (!list) return;
  try {
    const res = await apiFetch("/api/worlds?pageSize=100");
    const data = await res.json();
    const worlds = data.data || [];
    worldData.length = 0;
    worldData.push(...worlds);
    renderWorlds();
  } catch {
    /* ignore */
  }
};

function renderWorlds(): void {
  const list = document.querySelector("#world-list");
  if (!list) return;
  const query = (document.querySelector<HTMLInputElement>("#world-search")?.value ?? "").trim();
  const filtered = worldData
    .filter((w: any) => matchesQuery(w, query, ["name", "description"]))
    .sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:var(--space-12)">
      <div class="icon">🌍</div><div class="title">No worlds found</div>
      <div class="description">${query ? "No matches for your search." : "Create your first world."}</div>
    </div>`;
    return;
  }
  list.innerHTML = filtered
    .map(
      (w: any) =>
        `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
      <div class="world-header"><h3 class="world-name">${escapeHtml(w.name)}</h3><span class="world-id">ID: ${w.id}</span></div>
      <div class="world-description">${escapeHtml(w.description || "No description")}</div>
      <div class="world-meta"><span class="tag">${w.chat_count || 0} chats</span></div>
    </div>`,
    )
    .join("");
}

(globalThis as any).filterWorlds = function () {
  renderWorlds();
};

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

(globalThis as any).loadWorldDetail = async function () {
  const container = document.querySelector<HTMLElement>("#world-detail");
  const id = container?.dataset.worldId;
  if (!id) return;
  pageLog.debug("loadWorldDetail", { id });
  try {
    const res = await apiFetch(`/api/worlds/${id}`);
    if (!res.ok) return;
    const w = await res.json();
    if (!container) return;
    const roomItems = w.chat_rooms?.length
      ? w.chat_rooms
          .map(
            (c: any) => `<div class="chat-item"><span class="chat-name">${escapeHtml(c.name)}</span></div>`,
          )
          .join("")
      : null;
    const roomsHtml = roomItems
      ? `<div class="chat-list">${roomItems}</div>`
      : '<p style="color:var(--text-tertiary)">No chat rooms yet.</p>';
    container.innerHTML = `<div style="max-width:800px;margin:0 auto">
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <h2>${escapeHtml(w.name)}</h2>
        <p class="description">${escapeHtml(w.description || "")}</p>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <label class="form-label">Lore</label>
        <div class="lore-content">${escapeHtml(w.lore || "No lore provided.")}</div>
      </div>
      <div class="form-group" style="margin-bottom:var(--space-6)">
        <label class="form-label">Chat Rooms</label>
        ${roomsHtml}
      </div>
    </div>`;
  } catch {
    /* ignore */
  }
};

(globalThis as any).saveCharacterEdit = async function (id: string): Promise<void> {
  const body = {
    displayName: (document.querySelector("#edit-name") as HTMLInputElement)?.value,
    description: (document.querySelector("#edit-desc") as HTMLTextAreaElement)?.value,
    systemPrompt: (document.querySelector("#edit-system") as HTMLTextAreaElement)?.value,
    personality: (document.querySelector("#edit-personality") as HTMLTextAreaElement)?.value,
    welcomeMessage: (document.querySelector("#edit-greeting") as HTMLTextAreaElement)?.value,
    mesExample: (document.querySelector("#edit-example") as HTMLTextAreaElement)?.value,
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

(globalThis as any).loadCharacterEditPage = async function (): Promise<void> {
  const container = document.querySelector<HTMLElement>("#character-edit-form");
  const id = container?.dataset.characterId;
  if (!id) return;
  pageLog.debug("loadCharacterEditPage", { id });
  try {
    const res = await apiFetch("/api/actors/" + id);
    if (!res.ok) return;
    const c = await res.json();
    if (!container) return;
    const avatarHtml = c.avatar_asset_id
      ? `<img src="/api/assets/${c.avatar_asset_id}/thumb" style="width:100%;height:100%;object-fit:cover" alt="Avatar" />`
      : "<span>👤</span>";
    container.innerHTML = `
      <div style="max-width:720px;margin:0 auto;width:100%">
        <form id="char-edit-form" data-testid="character-edit-form">
          <div class="form-group" style="display:flex;align-items:flex-start;gap:var(--space-4)">
            <div style="width:80px;height:80px;border-radius:var(--radius-md);background:var(--bg-tertiary);display:flex;align-items:center;justify-content:center;font-size:36px;flex-shrink:0;overflow:hidden;border:1px solid var(--border-default)">
              <div id="avatar-preview">${avatarHtml}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:var(--space-2)">
              <label class="btn btn-secondary" style="cursor:pointer">
                <span id="upload-avatar-label">Upload Avatar</span>
                <input type="file" accept="image/*" style="display:none" id="avatar-input"
                  onchange="uploadAvatar(this)" />
              </label>
              ${c.avatar_asset_id ? '<button type="button" class="btn btn-danger" onclick="clearAvatar()">Remove</button>' : ""}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-name">Display Name</label>
            <input class="form-input" type="text" id="edit-name" value="${escapeAttr(c.display_name || "")}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-desc">Description</label>
            <textarea class="form-input form-textarea" id="edit-desc" rows="3">${escapeAttr(c.description || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-system">System Prompt</label>
            <textarea class="form-input form-textarea" id="edit-system" rows="6">${escapeAttr(c.system_prompt || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-personality">Personality</label>
            <textarea class="form-input form-textarea" id="edit-personality" rows="4">${escapeAttr(c.personality || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-greeting">Welcome Message (first_mes)</label>
            <textarea class="form-input form-textarea" id="edit-greeting" rows="4">${escapeAttr(c.welcome_message || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-example">Example Messages (mes_example)</label>
            <textarea class="form-input form-textarea" id="edit-example" rows="5">${escapeAttr(c.mes_example || "")}</textarea>
          </div>
          <input type="hidden" id="char-avatar-id" value="${c.avatar_asset_id || ""}" />
          <div style="display:flex;gap:var(--space-3);justify-content:flex-end;margin-top:var(--space-6)">
            <a href="/views/characters" class="btn btn-secondary" data-testid="cancel-edit-character">Cancel</a>
            <button type="button" class="btn btn-primary" onclick="saveCharacterEdit('${id}')" data-testid="save-character-btn">Save Character</button>
          </div>
        </form>
      </div>`;
  } catch {
    /* ignore */
  }
};

(globalThis as any).loadNewChatPage = async function (): Promise<void> {
  let actors: any[] = [];
  let selected: any[] = [];

  // Fetch actors
  try {
    const res = await apiFetch("/api/actors?pageSize=200");
    const data = await res.json();
    actors = (data.data || []).filter((a: any) => a.actor_type !== "user");
  } catch {
    /* ignore */
  }

  // DOM refs
  const searchInput = document.querySelector("#participant-search") as HTMLInputElement | null;
  const resultsEl = document.querySelector<HTMLElement>("#participant-results");
  const selectedEl = document.querySelector("#selected-participants");
  const chatType = document.querySelector("#chat-type") as HTMLSelectElement | null;
  const form = document.querySelector("#create-chat-form");
  if (!searchInput || !resultsEl || !selectedEl || !chatType || !form) return;

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
    if (!this.value.trim()) {
      return;
    }

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
      const res = await apiFetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: chatType.value,
          mode: (document.querySelector("#chat-mode") as HTMLSelectElement)?.value,
          participantIds: selected.map((a: any) => a.id),
        }),
      });
      if (res.ok) {
        const d = await res.json();
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

  // Wire localStorage toggles
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

  // Temperature slider
  const tempSlider = document.querySelector<HTMLInputElement>('[data-testid="temp-slider"]');
  const tempVal = document.querySelector("#temp-value");
  if (tempSlider && tempVal) {
    tempSlider.addEventListener("input", () => {
      tempVal.textContent = tempSlider.value;
    });
  }

  // Delete confirmation
  const confirmInput = document.querySelector<HTMLInputElement>("#confirm-delete-input");
  const confirmBtn = document.querySelector<HTMLButtonElement>("#delete-all-btn");
  if (confirmInput && confirmBtn) {
    confirmInput.addEventListener("input", () => {
      confirmBtn.disabled = confirmInput.value !== "DELETE";
    });
  }

  // Clear API key button
  document
    .querySelector("[data-action='clear-api-key']")
    ?.addEventListener("click", function (this: HTMLElement) {
      const input = this.previousElementSibling as HTMLInputElement | null;
      if (input) input.value = "";
    });
};
(globalThis as any).loadCharacterChatList = async function () {
  const container = document.querySelector<HTMLElement>("#character-chat-list");
  const id = container?.dataset.characterId;
  if (!id) return;
  pageLog.debug("loadCharacterChatList", { id });
  try {
    const res = await apiFetch(`/api/chats?characterId=${id}&pageSize=50`);
    const data = await res.json();
    if (!container) return;
    const chats = data.data || [];
    if (chats.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:var(--space-12)"><div class="icon">💬</div><div class="title">No chats yet</div></div>`;
      return;
    }
    const chatItems = chats
      .map((c: any) => {
        const preview = escapeHtml(c.last_message || "No messages yet");
        return `<div class="chat-item" onclick="location.assign('/views/chat?chatid=${c.id}')" data-testid="chat-item-${c.id}">
        <div class="chat-info"><h4 class="chat-name">${escapeHtml(c.name)}</h4><p class="chat-preview">${preview}</p></div>
        <span class="chat-time">${formatTimeAgo(c.updated_at)}</span>
      </div>`;
      })
      .join("");
    container.innerHTML = `<div class="chat-list" data-testid="character-chat-list">${chatItems}</div>`;
  } catch {
    /* ignore */
  }
};
