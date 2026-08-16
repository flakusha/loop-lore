// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

    ctx.templateFeaturesGroup = $<HTMLElement>("#template-features",);
    ctx.templateFeaturesList = $<HTMLElement>("#template-features-list",);
    ctx.fineTuneGroup = $<HTMLElement>("#fine-tune-group",);
    ctx.turnStrategySelect = $<HTMLSelectElement>("#chat-turn-strategy",);
    ctx.visibilitySelect = $<HTMLSelectElement>("#chat-visibility",);
    ctx.visualNovelCheckbox = $<HTMLInputElement>("#chat-visual-novel",);

    const renderTemplate = (id: string,) => {
      const t = ctx.templates.find((x,) => x.id === id) ?? null;
      const modeSelect = $<HTMLSelectElement>("#chat-mode",);

      // Pre-fill key mechanics from the template (fine-tune fields override).
      if (modeSelect && t?.mode) { modeSelect.value = t.mode; }
      if (ctx.turnStrategySelect) {
        ctx.turnStrategySelect.value = t?.turnStrategy ?? "";
      }
      if (ctx.visibilitySelect) {
        ctx.visibilitySelect.value = t?.visibility ?? "";
      }
      if (ctx.visualNovelCheckbox) {
        ctx.visualNovelCheckbox.checked = t?.visualNovel === true;
      }

      // Feature list: re-render tags on every selection change.
      if (ctx.templateFeaturesList) {
        ctx.templateFeaturesList.replaceChildren();
        const features = t?.features ?? [];
        for (const feature of features) {
          const li = document.createElement("li",);
          li.textContent = feature;
          ctx.templateFeaturesList.append(li,);
        }
        ctx.templateFeaturesList.ariaBusy = "false";
      }
      if (ctx.templateFeaturesGroup) {
        ctx.templateFeaturesGroup.style.display = t && t.features.length > 0 ? "block" : "none";
      }
      if (ctx.fineTuneGroup) {
        ctx.fineTuneGroup.style.display = t ? "block" : "none";
      }
    };

    ctx.templateSelect.addEventListener("change", function() {
      renderTemplate(this.value,);
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

  // ── GM-guided story toggle ───────────────────────────────
  const gmGuidedGroup = $<HTMLElement>("#gm-guided-group",);
  const gmGuidedToggle = $<HTMLInputElement>("#gm-guided-toggle",);
  const modeSelect = $<HTMLSelectElement>("#chat-mode",);
  const syncGmGuidedVisibility = () => {
    if (gmGuidedGroup && modeSelect) {
      gmGuidedGroup.style.display = modeSelect.value === "story" ? "block" : "none";
    }
  };
  modeSelect?.addEventListener("change", syncGmGuidedVisibility,);
  syncGmGuidedVisibility();
  gmGuidedToggle?.addEventListener("change", function() {
    if (modeSelect && this.checked) { modeSelect.value = "story"; }
  },);

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
