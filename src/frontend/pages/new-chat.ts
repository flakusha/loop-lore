// ── New Chat page: actor search, participant selection, form ──
import { jsonBody, } from "../alpine/json";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { escapeHtml, filterActors, getErrorMessage, } from "./shared";

globalThis.loadNewChatPage = async function(): Promise<void> {
  let actors: any[] = [];
  let selected: any[] = [];

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
    const personaSelect = document.querySelector("#persona-select",) as HTMLSelectElement | null;
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

  const searchInput = document.querySelector("#participant-search",) as HTMLInputElement | null;
  const resultsEl = document.querySelector<HTMLElement>("#participant-results",);
  const selectedEl = document.querySelector("#selected-participants",);
  const chatType = document.querySelector("#chat-type",) as HTMLSelectElement | null;
  const form = document.querySelector("#create-chat-form",);

  if (!searchInput || !resultsEl || !selectedEl || !chatType || !form) { return; }

  const impersonateGroup = document.querySelector("#impersonate-group",) as HTMLElement | null;
  const impersonateToggle = document.querySelector("#impersonate-toggle",) as HTMLInputElement | null;

  const isGroup = () => chatType.value === "group";

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
      const personaId = (document.querySelector("#persona-select",) as HTMLSelectElement)?.value || undefined;
      const impersonateId = impersonateToggle?.checked && selected.length === 1 ? selected[0].id : undefined;
      const res = await feFetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name,
          type: chatType.value,
          mode: (document.querySelector("#chat-mode",) as HTMLSelectElement)?.value,
          participantIds: selected.map((a: any,) => a.id),
          personaId,
          impersonateActorId: impersonateId,
        },),
      },);
      if (res.ok) {
        const d = await res.json();
        if (personaId) {
          feFetch(`/api/chats/${  d.id  }/persona`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ personaId, },),
          },);
        }
        if (impersonateId) {
          feFetch(`/api/chats/${  d.id  }/impersonate`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ impersonateActorId: impersonateId, },),
          },);
        }
        location.assign(`/views/chat?chatid=${  encodeURIComponent(d.id,)}`,);
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
