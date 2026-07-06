// Minimal inline logging — avoids logger module SERVER_LOG_BUFFER issue
const __log = (level: string, msg: string, meta?: unknown) => {
  console.log(`[${new Date().toISOString()}] [${level}] [pages] ${msg}`, meta ?? "");
};

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

function formatTimeAgo(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Characters page ─────────────────────────────────────────

(globalThis as any).loadCharactersPage = async function () {
  __log("DEBUG", "loadCharactersPage");
  const grid = document.querySelector("#character-grid");
  if (!grid) return;
  try {
    const res = await apiFetch("/api/actors?pageSize=100");
    const data = await res.json();
    const chars = (data.data || []).filter((c: any) => c.actor_type !== "user");
    if (chars.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="padding: var(--space-12)" data-testid="characters-empty">
        <div class="icon">👤</div><div class="title">No characters yet</div>
        <div class="description">Create your first character to start roleplaying.</div>
      </div>`;
      return;
    }
    grid.innerHTML = chars
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
  } catch {
    grid.innerHTML = `<div class="empty-state" style="padding: var(--space-12)"><div class="icon">⚠</div><div class="title">Failed to load characters</div></div>`;
  }
};

(globalThis as any).selectCharacterCard = async function (id: string) {
  try {
    const res = await apiFetch(`/api/actors/${id}`);
    if (!res.ok) return;
    const char = await res.json();
    const modal = document.querySelector("#character-detail-modal") as HTMLElement;
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
      globalThis.showToast("success", "Character deleted");
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
  __log("DEBUG", "loadGalleryPage");
  const grid = document.querySelector("#asset-grid");
  if (!grid) return;
  try {
    const res = await apiFetch("/api/assets?pageSize=200");
    const data = await res.json();
    const assets = data.data || [];
    if (assets.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
        <div class="icon">📁</div><div class="title">No assets yet</div>
        <div class="description">Upload images, audio, or video to get started.</div>
      </div>`;
      return;
    }
    grid.innerHTML = assets
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
  } catch {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠</div><div class="title">Failed to load</div></div>`;
  }
};

(globalThis as any).openAssetPreview = async function (id: string) {
  __log("DEBUG", "openAssetPreview", { id });
  try {
    const res = await apiFetch(`/api/assets/${id}`);
    if (!res.ok) return;
    const a = await res.json();
    (globalThis as any).__previewAsset = a;
    const modal = document.querySelector("#preview-modal") as HTMLElement;
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
    globalThis.showToast("success", "URL copied");
  } catch {
    globalThis.showToast("error", "Failed to copy");
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
      globalThis.showToast("success", "Asset deleted");
      (globalThis as any).loadGalleryPage();
    }
  } catch {
    globalThis.showToast("error", "Failed to delete");
  }
};

// ── Worlds page ────────────────────────────────────────────

(globalThis as any).loadWorldsPage = async function () {
  __log("DEBUG", "loadWorldsPage");
  const list = document.querySelector("#world-list");
  if (!list) return;
  try {
    const res = await apiFetch("/api/worlds?pageSize=100");
    const data = await res.json();
    const worlds = data.data || [];
    if (worlds.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:var(--space-12)">
        <div class="icon">🌍</div><div class="title">No worlds yet</div>
        <div class="description">Create your first world.</div>
      </div>`;
      return;
    }
    list.innerHTML = worlds
      .map(
        (w: any) =>
          `<div class="world-card" onclick="location.assign('/worlds/${w.id}')" data-testid="world-card-${w.id}">
        <div class="world-header"><h3 class="world-name">${escapeHtml(w.name)}</h3><span class="world-id">ID: ${w.id}</span></div>
        <div class="world-description">${escapeHtml(w.description || "No description")}</div>
        <div class="world-meta"><span class="tag">${w.chat_count || 0} chats</span></div>
      </div>`,
      )
      .join("");
  } catch {
    list.innerHTML = `<div class="empty-state"><div class="icon">⚠</div><div class="title">Failed to load</div></div>`;
  }
};

(globalThis as any).createWorld = async function (event: Event) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const formData = new FormData(form);
  const data: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    data[key] = value;
  });
  __log("DEBUG", "createWorld", { data });
  try {
    const res = await apiFetch("/api/worlds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    __log("DEBUG", "createWorld response", { status: res.status });
    if (res.ok) {
      const data = await res.json();
      document.getElementById("create-world-modal")?.classList.remove("open");
      globalThis.showToast("success", "World created");
      location.assign(`/worlds/${data.id}/edit`);
    } else {
      const err = await res.json();
      globalThis.showToast("error", err.error || "Failed to create world");
    }
  } catch {
    globalThis.showToast("error", "Network error");
  }
};

(globalThis as any).loadWorldDetail = async function () {
  const container = document.querySelector("#world-detail") as HTMLElement | null;
  const id = container?.dataset.worldId;
  if (!id) return;
  __log("DEBUG", "loadWorldDetail", { id });
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

(globalThis as any).loadCharacterChatList = async function () {
  const container = document.querySelector("#character-chat-list") as HTMLElement | null;
  const id = container?.dataset.characterId;
  if (!id) return;
  __log("DEBUG", "loadCharacterChatList", { id });
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
