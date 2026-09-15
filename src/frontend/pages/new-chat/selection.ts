// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { filterActors, } from "../shared";
import { loadMemoriesForActor, } from "./memory";
import { isGroup, type NewChatCtx, } from "./state";
/**
 * @param ctx
 */
export function renderSelected(ctx: NewChatCtx,): void {
  if (!ctx.selectedEl) { return; }
  // DOM-clear before re-rendering so previously-attached listeners are released
  // from detached nodes (innerHTML replacement would leak them).
  while (ctx.selectedEl.firstChild) { ctx.selectedEl.removeChild(ctx.selectedEl.firstChild,); }
  for (const a of ctx.selected) {
    const chip = document.createElement("span",);
    chip.style.cssText =
      "display:inline-flex;align-items:center;gap:var(--space-1);padding:2px var(--space-2);background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:13px";
    chip.textContent = a.display_name || a.name || "Unknown";
    const btn = document.createElement("button",);
    btn.type = "button";
    btn.className = "btn-icon";
    btn.style.cssText = "font-size:14px;width:18px;height:18px";
    btn.dataset["id"] = a.id;
    btn.innerHTML = "&times;";
    btn.addEventListener("click", () => {
      const fn = (globalThis as Record<string, unknown>)["removeParticipant"];
      if (typeof fn === "function") { (fn as (id: string,) => void)(a.id,); }
    },);
    chip.appendChild(btn,);
    ctx.selectedEl.appendChild(chip,);
  }
}

/**
 * @param ctx
 * @param filtered
 */
export function renderResults(ctx: NewChatCtx, filtered: any[],): void {
  if (!ctx.resultsEl) { return; }
  while (ctx.resultsEl.firstChild) { ctx.resultsEl.removeChild(ctx.resultsEl.firstChild,); }
  if (filtered.length === 0) {
    const empty = document.createElement("div",);
    empty.style.cssText = "padding:var(--space-3);color:var(--text-secondary);font-size:13px;text-align:center";
    empty.textContent = "No characters found";
    ctx.resultsEl.appendChild(empty,);
    return;
  }
  for (const a of filtered) {
    const disabled = isGroup(ctx,) && ctx.selected.find((s: any,) => s.id === a.id);
    const row = document.createElement("div",);
    const cursorAndOpacity = disabled ? "opacity:0.4;cursor:default" : "cursor:pointer";
    row.style.cssText =
      `padding:var(--space-2) var(--space-3);${cursorAndOpacity};display:flex;align-items:center;gap:var(--space-2)`;
    row.addEventListener("mouseenter", () => {
      row.style.background = "var(--bg-tertiary)";
    },);
    row.addEventListener("mouseleave", () => {
      row.style.background = "";
    },);
    if (!disabled) {
      row.addEventListener("click", () => {
        const fn = (globalThis as Record<string, unknown>)["selectActorFromList"];
        if (typeof fn === "function") { (fn as (id: string,) => void)(a.id,); }
      },);
    }
    const avatar = document.createElement("span",);
    avatar.style.fontSize = "16px";
    avatar.textContent = a.avatar_asset_id ? "" : "👤";
    const info = document.createElement("div",);
    const name = document.createElement("div",);
    name.style.cssText = "font-size:14px;font-weight:500";
    name.textContent = a.display_name || a.name || "Unknown";
    const desc = document.createElement("div",);
    desc.style.cssText = "font-size:12px;color:var(--text-secondary)";
    desc.textContent = (a.description || "").slice(0, 60,);
    info.append(name, desc,);
    row.append(avatar, info,);
    if (disabled) {
      const tag = document.createElement("span",);
      tag.style.cssText = "margin-left:auto;font-size:12px;color:var(--text-secondary)";
      tag.textContent = "added";
      row.appendChild(tag,);
    }
    ctx.resultsEl.appendChild(row,);
  }
}

// Show memory carry when character is selected
/**
 * @param ctx
 */
export function updateMemoryCarryVisibility(ctx: NewChatCtx,): void {
  if (!ctx.memoryCarryGroup) {
    return;
  }

  const hasCharacter = ctx.selected.length > 0 && !isGroup(ctx,);
  ctx.memoryCarryGroup.style.display = hasCharacter ? "block" : "none";
  if (hasCharacter && ctx.selected[0]) {
    loadMemoriesForActor(ctx, ctx.selected[0].id,);
  }
}

/**
 * @param ctx
 * @param id
 */
export function removeParticipant(ctx: NewChatCtx, id: string,): void {
  const next: any[] = [];
  for (const a of ctx.selected) {
    if (a.id !== id) { next.push(a,); }
  }
  ctx.selected = next;
  renderSelected(ctx,);
  updateMemoryCarryVisibility(ctx,);
  if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
  if (ctx.impersonateGroup && ctx.impersonateToggle) {
    ctx.impersonateGroup.style.display = ctx.selected.length === 1 ? "" : "none";
    if (ctx.selected.length !== 1) { ctx.impersonateToggle.checked = false; }
  }
}

/**
 * @param ctx
 * @param actor
 */
export function selectActor(ctx: NewChatCtx, actor: any,): void {
  if (isGroup(ctx,)) {
    if (ctx.selected.every((a: any,) => a.id !== actor.id)) { ctx.selected.push(actor,); }
  } else {
    ctx.selected = [actor,];
  }
  renderSelected(ctx,);
  updateMemoryCarryVisibility(ctx,);
  if (ctx.searchInput) { ctx.searchInput.value = ""; }
  if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
  if (ctx.impersonateGroup && ctx.impersonateToggle) {
    ctx.impersonateGroup.style.display = ctx.selected.length === 1 ? "" : "none";
    if (ctx.selected.length !== 1) { ctx.impersonateToggle.checked = false; }
  }
}

/**
 * @param ctx
 * @param id
 */
export function selectActorFromList(ctx: NewChatCtx, id: string,): void {
  const actor = ctx.actors.find((a: any,) => a.id === id);
  if (actor) { selectActor(ctx, actor,); }
}

/**
 * @param ctx
 */
export function bindSelectionHandlers(ctx: NewChatCtx,): void {
  globalThis.removeParticipant = function(id: string,) {
    removeParticipant(ctx, id,);
  };

  globalThis.selectActorFromList = function(id: string,) {
    selectActorFromList(ctx, id,);
  };

  ctx.searchInput!.addEventListener("input", function() {
    const q = this.value.toLowerCase().trim();
    if (!q) {
      if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
      return;
    }
    renderResults(ctx, filterActors(ctx.actors, q,),);
  },);

  ctx.searchInput!.addEventListener("blur", function() {
    setTimeout(() => {
      if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
    }, 200,);
  },);

  ctx.searchInput!.addEventListener("focus", function() {
    const q = this.value.toLowerCase().trim();
    if (!q) { return; }
    renderResults(ctx, filterActors(ctx.actors, q,),);
  },);
}
