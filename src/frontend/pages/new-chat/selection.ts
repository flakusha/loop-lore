// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { parseAlternateGreetings, } from "../../../characters/greetings";
import { ActorType, AgentType, } from "../../../db/enums-core/actors";
import { filterActors, } from "../shared";
import { loadMemoriesForActor, } from "./memory";
import { isGroup, type NewChatCtx, } from "./state";

/** The subset of an `/api/v1/actors` row the kind filter inspects. */
interface KindableActor {
  id?: string;
  actor_type?: string;
  agent_type?: string;
}

/**
 * Narrow actor rows by the participant picker's kind facet. Pure: no DOM,
 * no mutation of the input array. Unknown/missing kind behaves like "all";
 * rows missing the field a non-all kind needs are excluded.
 * @param actors
 * @param kind - "all" | "user" | "character" | "assistant"
 * @returns {KindableActor[]}
 */
export function filterActorsByKind(actors: KindableActor[], kind: string,): KindableActor[] {
  switch (kind) {
    case "user":
      return actors.filter((a,) => a.actor_type === ActorType.User);
    case "character":
      return actors.filter((a,) => a.actor_type === ActorType.Character);
    case "assistant":
      return actors.filter((a,) => a.agent_type === AgentType.Ai);
    default:
      return actors;
  }
}

/** A greeting option shown by the new-chat picker. */
export interface GreetingOption {
  value: string;
  label: string;
}

/**
 * Build the picker options for the current selection. The picker is only
 * meaningful for a single selected character carrying alternate greetings.
 * @param selected - currently selected actor rows
 * @returns options to render; empty when the picker should stay hidden
 */
export function greetingOptions(selected: any[],): GreetingOption[] {
  if (selected.length !== 1) { return []; }
  const alternates = parseAlternateGreetings(selected[0]?.alternate_greetings,);
  if (alternates.length === 0) { return []; }
  return [
    { value: "", label: "Default greeting", },
    ...alternates.map((_text, index,) => ({ value: String(index,), label: `Alternate greeting ${index + 1}`, })),
  ];
}

/**
 * Rebuild the greeting picker from the current selection, resetting to the
 * primary greeting on every change — including a character switch.
 * @param ctx
 * @returns {void}
 */
export function updateGreetingPicker(ctx: NewChatCtx,): void {
  const group = ctx.greetingGroup;
  const select = ctx.greetingSelect;
  if (!group || !select) { return; }

  const options = greetingOptions(ctx.selected,);
  group.style.display = options.length > 0 ? "" : "none";
  select.replaceChildren();
  for (const option of options) {
    const el = document.createElement("option",);
    el.value = option.value;
    el.textContent = option.label;
    select.append(el,);
  }

  select.value = "";
}

/**
 * @param ctx
 * @returns {void}
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
 * @returns {void}
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
 * @returns {void}
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
 * @returns {void}
 */
export function removeParticipant(ctx: NewChatCtx, id: string,): void {
  const next: any[] = [];
  for (const a of ctx.selected) {
    if (a.id !== id) { next.push(a,); }
  }

  ctx.selected = next;
  renderSelected(ctx,);
  updateMemoryCarryVisibility(ctx,);
  updateGreetingPicker(ctx,);
  if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
  if (ctx.impersonateGroup && ctx.impersonateToggle) {
    ctx.impersonateGroup.style.display = ctx.selected.length === 1 ? "" : "none";
    if (ctx.selected.length !== 1) { ctx.impersonateToggle.checked = false; }
  }
}

/**
 * @param ctx
 * @param actor
 * @returns {void}
 */
export function selectActor(ctx: NewChatCtx, actor: any,): void {
  if (isGroup(ctx,)) {
    if (ctx.selected.every((a: any,) => a.id !== actor.id)) { ctx.selected.push(actor,); }
  } else {
    ctx.selected = [actor,];
  }

  renderSelected(ctx,);
  updateMemoryCarryVisibility(ctx,);
  updateGreetingPicker(ctx,);
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
 * @returns {void}
 */
export function selectActorFromList(ctx: NewChatCtx, id: string,): void {
  const actor = ctx.actors.find((a: any,) => a.id === id);
  if (actor) { selectActor(ctx, actor,); }
}

/**
 * @param ctx
 * @returns {void}
 */
export function bindSelectionHandlers(ctx: NewChatCtx,): void {
  globalThis.removeParticipant = function(id: string,) {
    removeParticipant(ctx, id,);
  };

  globalThis.selectActorFromList = function(id: string,) {
    selectActorFromList(ctx, id,);
  };

  const kindSelect = document.querySelector<HTMLSelectElement>("#participant-kind-filter",);

  const renderFromQuery = () => {
    const q = (ctx.searchInput?.value ?? "").toLowerCase().trim();
    if (!q) {
      if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
      return;
    }

    const inKind = filterActorsByKind(ctx.actors, kindSelect?.value ?? "all",);
    renderResults(ctx, filterActors(inKind, q,),);
  };

  ctx.searchInput!.addEventListener("input", renderFromQuery,);

  ctx.searchInput!.addEventListener("blur", function() {
    setTimeout(() => {
      if (ctx.resultsEl) { ctx.resultsEl.style.display = "none"; }
    }, 200,);
  },);

  ctx.searchInput!.addEventListener("focus", renderFromQuery,);

  kindSelect?.addEventListener("change", renderFromQuery,);
  kindSelect?.addEventListener("input", renderFromQuery,);
}
