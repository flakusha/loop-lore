// ── New Chat page: actor search, participant selection, form ──
import { jsonBody, } from "../alpine/json";
import { $, } from "../dom";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { escapeHtml, filterActors, getErrorMessage, } from "./shared";

/** Estimate tokens from content length (~4 chars per token). */
function estimateTokens(content: string,): number {
  return Math.ceil(content.length / 4,);
}

globalThis.loadNewChatPage = async function(): Promise<void> {
  let actors: any[] = [];
  let selected: any[] = [];
  let characterMemories: Array<
    { id: string; content: string; type: string; importance: number; pinned: boolean; tokens: number }
  > = [];
  let selectedMemoryIds = new Set<string>();

  try {
    const res = await feFetch("/api/actors?pageSize=200",);
    const data = await res.json();
    actors = data.data || [];
  } catch {
    /* ignore */
  }

  try {
    const res = await feFetch("/api/personas",);
    const personas = await res.json();
    const personaSelect = $<HTMLSelectElement>("#persona-select",);
    if (personaSelect && Array.isArray(personas,)) {
      for (const p of personas) {
        const opt = document.createElement("option",);
        opt.value = p.id;
        opt.textContent = p.name;
        if (p.is_default === "default") { opt.selected = true; }
        personaSelect.append(opt,);
      }
    }
  } catch {
    /* ignore */
  }

  const searchInput = $<HTMLInputElement>("#participant-search",);
  const resultsEl = $<HTMLElement>("#participant-results",);
  const selectedEl = $<HTMLElement>("#selected-participants",);
  const chatType = $<HTMLSelectElement>("#chat-type",);
  const form = $<HTMLFormElement>("#create-chat-form",);

  if (!searchInput || !resultsEl || !selectedEl || !chatType || !form) { return; }

  const impersonateGroup = $<HTMLElement>("#impersonate-group",);
  const impersonateToggle = $<HTMLInputElement>("#impersonate-toggle",);
  const memoryCarryGroup = $<HTMLElement>("#memory-carry-group",);
  const memorySelectiveList = $<HTMLElement>("#memory-selective-list",);
  const memoryCheckboxList = $<HTMLElement>("#memory-checkbox-list",);
  const memoryCountLabel = $<HTMLElement>("#memory-count-label",);
  const memoryTokenEstimate = $<HTMLElement>("#memory-token-estimate",);
  const memoryTokenCount = $<HTMLElement>("#memory-token-count",);
  const memorySelectAllBtn = $<HTMLButtonElement>("#memory-select-all-btn",);

  const isGroup = () => chatType.value === "group";

  // ── Memory carry logic ──────────────────────────────────────

  async function loadMemoriesForActor(actorId: string,) {
    try {
      const res = await feFetch(`/api/actors/${actorId}/memories`,);
      if (!res.ok) { return; }
      const data = await res.json() as {
        items: Array<{
          id: string;
          content: string;
          memory_type: string;
          importance: number;
          pinned?: boolean;
        }>;
      };
      characterMemories = (data.items ?? []).map((m,) => ({
        id: m.id,
        content: m.content,
        type: m.memory_type,
        importance: m.importance,
        pinned: !!m.pinned,
        tokens: estimateTokens(m.content,),
      }));
      selectedMemoryIds = new Set(characterMemories.map((m,) => m.id),);
      renderMemoryList();
    } catch {
      characterMemories = [];
    }
  }

  function renderMemoryList() {
    if (!memoryCheckboxList || !memoryCountLabel) { return; }

    const selectedTokens = characterMemories
      .filter((m,) => selectedMemoryIds.has(m.id,))
      .reduce((sum, m,) => sum + m.tokens, 0,);

    memoryCountLabel.textContent = `${characterMemories.length} memories`;
    if (memoryTokenCount) { memoryTokenCount.textContent = String(selectedTokens,); }
    if (memoryTokenEstimate) {
      memoryTokenEstimate.style.display = characterMemories.length > 0 ? "block" : "none";
    }

    memoryCheckboxList.innerHTML = characterMemories
      .map((m,) => {
        const checked = selectedMemoryIds.has(m.id,) ? "checked" : "";
        const preview = m.content.length > 80 ? `${m.content.slice(0, 80,)}...` : m.content;
        return `<label style="display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-1) 0; font-size: 12px; cursor: pointer; border-bottom: 1px solid var(--border-default, #f0f0f0)">
          <input type="checkbox" value="${m.id}" ${checked} onchange="window._toggleMemorySelect('${m.id}', this.checked)" style="margin-top: 2px" />
          <div>
            <div style="color: var(--text-primary)">${escapeHtml(preview,)}</div>
            <div style="font-size: 10px; color: var(--text-secondary)">${m.type} · ${m.tokens} tokens${
          m.pinned ? " · 📌" : ""
        }</div>
          </div>
        </label>`;
      },)
      .join("",);
  }

  (globalThis as any)._toggleMemorySelect = function(id: string, checked: boolean,) {
    if (checked) {
      selectedMemoryIds.add(id,);
    } else {
      selectedMemoryIds.delete(id,);
    }
    renderMemoryList();
  };

  // Memory carry radio buttons
  const memoryRadios = document.querySelectorAll<HTMLInputElement>('input[name="memory_carry"]',);
  for (const radio of memoryRadios) {
    radio.addEventListener("change", () => {
      const mode = radio.value;
      if (memorySelectiveList) {
        memorySelectiveList.style.display = mode === "selective" ? "block" : "none";
      }
    },);
  }

  // Select all / deselect all
  if (memorySelectAllBtn) {
    memorySelectAllBtn.addEventListener("click", () => {
      const allSelected = selectedMemoryIds.size === characterMemories.length;
      if (allSelected) {
        selectedMemoryIds.clear();
        memorySelectAllBtn.textContent = "Select All";
      } else {
        selectedMemoryIds = new Set(characterMemories.map((m,) => m.id),);
        memorySelectAllBtn.textContent = "Deselect All";
      }
      renderMemoryList();
    },);
  }

  // Show memory carry when character is selected
  function updateMemoryCarryVisibility() {
    if (!memoryCarryGroup) {
      return;
    }

    const hasCharacter = selected.length > 0 && !isGroup();
    memoryCarryGroup.style.display = hasCharacter ? "block" : "none";
    if (hasCharacter && selected[0]) {
      loadMemoriesForActor(selected[0].id,);
    }
  }

  function renderSelected() {
    if (!selectedEl) { return; }
    selectedEl.innerHTML = selected
      .map(
        (a: any,) =>
          `<span style="display:inline-flex;align-items:center;gap:var(--space-1);padding:2px var(--space-2);background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:13px">
        ${escapeHtml(a.display_name || a.name || "Unknown",)}
        <button type="button" class="btn-icon" style="font-size:14px;width:18px;height:18px" data-id="${a.id}" onclick="removeParticipant('${a.id}')">&times;</button>
      </span>`,
      )
      .join("",);
  }

  globalThis.removeParticipant = function(id: string,) {
    selected = selected.filter((a: any,) => a.id !== id);
    renderSelected();
    updateMemoryCarryVisibility();
    if (resultsEl) { resultsEl.style.display = "none"; }
    if (impersonateGroup && impersonateToggle) {
      impersonateGroup.style.display = selected.length === 1 ? "" : "none";
      if (selected.length !== 1) { impersonateToggle.checked = false; }
    }
  };

  function selectActor(actor: any,) {
    if (isGroup()) {
      if (selected.every((a: any,) => a.id !== actor.id)) { selected.push(actor,); }
    } else {
      selected = [actor,];
    }
    renderSelected();
    updateMemoryCarryVisibility();
    if (searchInput) { searchInput.value = ""; }
    if (resultsEl) { resultsEl.style.display = "none"; }
    if (impersonateGroup && impersonateToggle) {
      impersonateGroup.style.display = selected.length === 1 ? "" : "none";
      if (selected.length !== 1) { impersonateToggle.checked = false; }
    }
  }

  globalThis.selectActorFromList = function(id: string,) {
    const actor = actors.find((a: any,) => a.id === id);
    if (actor) { selectActor(actor,); }
  };

  function renderResults(filtered: any[],) {
    if (!resultsEl) { return; }
    resultsEl.innerHTML = filtered.length === 0
      ? '<div style="padding:var(--space-3);color:var(--text-secondary);font-size:13px;text-align:center">No characters found</div>'
      : filtered
        .map((a: any,) => {
          const disabled = isGroup() && selected.find((s: any,) => s.id === a.id);
          const onclickAttr = disabled ? "" : `onclick="selectActorFromList('${a.id}')"`;
          return `<div style="padding:var(--space-2) var(--space-3);cursor:pointer;display:flex;align-items:center;gap:var(--space-2);${
            disabled ? "opacity:0.4;cursor:default" : ""
          }" ${onclickAttr} onmouseenter="this.style.background='var(--bg-tertiary)'" onmouseleave="this.style.background=''">
          <span style="font-size:16px">${a.avatar_asset_id ? "" : "👤"}</span>
          <div>
            <div style="font-size:14px;font-weight:500">${escapeHtml(a.display_name || a.name || "Unknown",)}</div>
            <div style="font-size:12px;color:var(--text-secondary)">${
            escapeHtml((a.description || "").slice(0, 60,),)
          }</div>
          </div>
          ${disabled ? '<span style="margin-left:auto;font-size:12px;color:var(--text-secondary)">added</span>' : ""}
        </div>`;
        },)
        .join("",);
    resultsEl.style.display = "block";
  }

  searchInput.addEventListener("input", function() {
    const q = this.value.toLowerCase().trim();
    if (!q) {
      if (resultsEl) { resultsEl.style.display = "none"; }
      return;
    }
    renderResults(filterActors(actors, q,),);
  },);

  searchInput.addEventListener("blur", function() {
    setTimeout(() => {
      if (resultsEl) { resultsEl.style.display = "none"; }
    }, 200,);
  },);

  searchInput.addEventListener("focus", function() {
    const q = this.value.toLowerCase().trim();
    if (!q) { return; }
    renderResults(filterActors(actors, q,),);
  },);

  form.addEventListener("submit", async function(e: Event,) {
    e.preventDefault();
    const nameInput = form.querySelector<HTMLInputElement>('[name="name"]',);
    if (!nameInput) { return; }
    const name = nameInput.value.trim();
    if (!name) { return; }

    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]',);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Creating...";
    }

    try {
      const personaId = $<HTMLSelectElement>("#persona-select",)?.value || undefined;
      const impersonateId = impersonateToggle?.checked && selected.length === 1 ? selected[0].id : undefined;
      const memoryCarryMode = $<HTMLInputElement>('input[name="memory_carry"]:checked',)?.value || "full";
      const memoryCarryIds = memoryCarryMode === "selective"
        ? Array.from(selectedMemoryIds,)
        : undefined;
      const res = await feFetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name,
          type: chatType.value,
          mode: $<HTMLSelectElement>("#chat-mode",)?.value,
          participantIds: selected.map((a: any,) => a.id),
          personaId,
          impersonateActorId: impersonateId,
          memoryCarry: memoryCarryMode,
          memoryCarryIds,
        },),
      },);
      if (res.ok) {
        const d = await res.json();
        if (personaId) {
          feFetch(`/api/chats/${d.id}/persona`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ personaId, },),
          },);
        }
        if (impersonateId) {
          feFetch(`/api/chats/${d.id}/impersonate`, {
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
};
