// ── New Chat page: actor search, participant selection, form ──
import { $, } from "../../dom";
import { feFetch, } from "../../fe-fetch";
import { bindMemoryHandlers, } from "./memory";
import { bindSelectionHandlers, } from "./selection";
import { createCtx, type NewChatCtx, } from "./state";
import { bindSubmitHandler, } from "./submit";

globalThis.loadNewChatPage = async function(): Promise<void> {
  const ctx: NewChatCtx = createCtx();

  try {
    const res = await feFetch("/api/actors?pageSize=200",);
    const data = await res.json();
    ctx.actors = data.data || [];
  } catch {
    /* ignore */
  }

  // ── Chat setup templates: load + pre-fill key mechanics ─────
  try {
    const res = await feFetch("/api/v1/chat-setup-templates",);
    if (res.ok) {
      ctx.templates = (await res.json()) as typeof ctx.templates;
    }
  } catch {
    /* ignore */
  }

  ctx.templateSelect = $<HTMLSelectElement>("#chat-template",);
  if (ctx.templateSelect && ctx.templates.length > 0) {
    for (const t of ctx.templates) {
      const opt = document.createElement("option",);
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.description) { opt.title = t.description; }
      ctx.templateSelect.append(opt,);
    }
    ctx.templateSelect.addEventListener("change", function() {
      const t = ctx.templates.find((x,) => x.id === this.value);
      const modeSelect = $<HTMLSelectElement>("#chat-mode",);
      if (modeSelect && t?.mode) {
        modeSelect.value = t.mode;
      }
    },);
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

  ctx.searchInput = $<HTMLInputElement>("#participant-search",);
  ctx.resultsEl = $<HTMLElement>("#participant-results",);
  ctx.selectedEl = $<HTMLElement>("#selected-participants",);
  ctx.chatType = $<HTMLSelectElement>("#chat-type",);
  ctx.form = $<HTMLFormElement>("#create-chat-form",);

  if (!ctx.searchInput || !ctx.resultsEl || !ctx.selectedEl || !ctx.chatType || !ctx.form) { return; }

  ctx.impersonateGroup = $<HTMLElement>("#impersonate-group",);
  ctx.impersonateToggle = $<HTMLInputElement>("#impersonate-toggle",);
  ctx.memoryCarryGroup = $<HTMLElement>("#memory-carry-group",);
  ctx.memorySelectiveList = $<HTMLElement>("#memory-selective-list",);
  ctx.memoryCheckboxList = $<HTMLElement>("#memory-checkbox-list",);
  ctx.memoryCountLabel = $<HTMLElement>("#memory-count-label",);
  ctx.memoryTokenEstimate = $<HTMLElement>("#memory-token-estimate",);
  ctx.memoryTokenCount = $<HTMLElement>("#memory-token-count",);
  ctx.memorySelectAllBtn = $<HTMLButtonElement>("#memory-select-all-btn",);

  bindMemoryHandlers(ctx,);
  bindSelectionHandlers(ctx,);
  bindSubmitHandler(ctx,);
};
