// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { escapeHtml, filterActors, } from "../shared";
import { loadMemoriesForActor, } from "./memory";
import { isGroup, type NewChatCtx, } from "./state";

/**
 * @param ctx
 */
export function renderSelected(ctx: NewChatCtx,): void {
  if (!ctx.selectedEl) { return; }
  const selectedItems = Array.from(
    ctx.selected,
    (a: any,) =>
      `<span style="display:inline-flex;align-items:center;gap:var(--space-1);padding:2px var(--space-2);background:var(--bg-tertiary);border-radius:var(--radius-sm);font-size:13px">
        ${escapeHtml(a.display_name || a.name || "Unknown",)}
        <button type="button" class="btn-icon" style="font-size:14px;width:18px;height:18px" data-id="${a.id}" onclick="removeParticipant('${a.id}')">&times;</button>
      </span>`,
  );
  ctx.selectedEl.innerHTML = selectedItems.join("",);
}

/**
 * @param ctx
 * @param filtered
 */
export function renderResults(ctx: NewChatCtx, filtered: any[],): void {
  if (!ctx.resultsEl) { return; }
  if (filtered.length === 0) {
    ctx.resultsEl.innerHTML =
      '<div style="padding:var(--space-3);color:var(--text-secondary);font-size:13px;text-align:center">No characters found</div>';
  } else {
    const resultItems: string[] = [];
    for (const a of filtered) {
      const disabled = isGroup(ctx,) && ctx.selected.find((s: any,) => s.id === a.id);
      const onclickAttr = disabled ? "" : `onclick="selectActorFromList('${a.id}')"`;
      resultItems.push(
        `<div style="padding:var(--space-2) var(--space-3);cursor:pointer;display:flex;align-items:center;gap:var(--space-2);${
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
        </div>`,
      );
    }
    ctx.resultsEl.innerHTML = resultItems.join("",);
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
