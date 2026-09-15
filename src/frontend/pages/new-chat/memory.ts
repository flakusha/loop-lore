// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { feFetch, } from "../../fe-fetch";
import { estimateTokens, } from "./helpers";

import type { NewChatCtx, } from "./state";

/**
 * @param ctx
 * @param actorId
 */
export async function loadMemoriesForActor(ctx: NewChatCtx, actorId: string,): Promise<void> {
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
    ctx.characterMemories = Array.from(data.items ?? [], (m,) => ({
      id: m.id,
      content: m.content,
      type: m.memory_type,
      importance: m.importance,
      pinned: !!m.pinned,
      tokens: estimateTokens(m.content,),
    }),);
    ctx.selectedMemoryIds = new Set(Array.from(ctx.characterMemories, (m,) => m.id,),);
    renderMemoryList(ctx,);
  } catch {
    ctx.characterMemories = [];
  }
}

/**
 * @param ctx
 */
export function renderMemoryList(ctx: NewChatCtx,): void {
  if (!ctx.memoryCheckboxList || !ctx.memoryCountLabel) { return; }

  let selectedTokens = 0;
  for (const m of ctx.characterMemories) {
    if (ctx.selectedMemoryIds.has(m.id,)) { selectedTokens += m.tokens; }
  }

  ctx.memoryCountLabel.textContent = `${ctx.characterMemories.length} memories`;
  if (ctx.memoryTokenCount) { ctx.memoryTokenCount.textContent = String(selectedTokens,); }
  if (ctx.memoryTokenEstimate) {
    ctx.memoryTokenEstimate.style.display = ctx.characterMemories.length > 0 ? "block" : "none";
  }

  while (ctx.memoryCheckboxList.firstChild) { ctx.memoryCheckboxList.removeChild(ctx.memoryCheckboxList.firstChild,); }
  for (const m of ctx.characterMemories) {
    const label = document.createElement("label",);
    label.style.cssText =
      "display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-1) 0; font-size: 12px; cursor: pointer; border-bottom: 1px solid var(--border-default, #f0f0f0)";
    const cb = document.createElement("input",);
    cb.type = "checkbox";
    cb.value = m.id;
    cb.checked = ctx.selectedMemoryIds.has(m.id,);
    cb.style.marginTop = "2px";
    cb.addEventListener("change", () => {
      const fn = (globalThis as Record<string, unknown>)["_toggleMemorySelect"];
      if (typeof fn === "function") { (fn as (id: string, checked: boolean,) => void)(m.id, cb.checked,); }
    },);
    const wrap = document.createElement("div",);
    const preview = document.createElement("div",);
    preview.style.color = "var(--text-primary)";
    preview.textContent = m.content.length > 80 ? `${m.content.slice(0, 80,)}...` : m.content;
    const meta = document.createElement("div",);
    meta.style.cssText = "font-size: 10px; color: var(--text-secondary)";
    meta.textContent = `${m.type} · ${m.tokens} tokens${m.pinned ? " · 📌" : ""}`;
    wrap.append(preview, meta,);
    label.append(cb, wrap,);
    ctx.memoryCheckboxList.appendChild(label,);
  }
}

/**
 * @param ctx
 */
export function bindMemoryHandlers(ctx: NewChatCtx,): void {
  (globalThis as any)._toggleMemorySelect = function(id: string, checked: boolean,) {
    if (checked) {
      ctx.selectedMemoryIds.add(id,);
    } else {
      ctx.selectedMemoryIds.delete(id,);
    }
    renderMemoryList(ctx,);
  };

  // Memory carry radio buttons
  const memoryRadios = document.querySelectorAll<HTMLInputElement>('input[name="memory_carry"]',);
  for (const radio of memoryRadios) {
    radio.addEventListener("change", () => {
      const mode = radio.value;
      if (ctx.memorySelectiveList) {
        ctx.memorySelectiveList.style.display = mode === "selective" ? "block" : "none";
      }
    },);
  }

  // Select all / deselect all
  if (ctx.memorySelectAllBtn) {
    ctx.memorySelectAllBtn.addEventListener("click", () => {
      const allSelected = ctx.selectedMemoryIds.size === ctx.characterMemories.length;
      if (allSelected) {
        ctx.selectedMemoryIds.clear();
        ctx.memorySelectAllBtn!.textContent = "Select All";
      } else {
        ctx.selectedMemoryIds = new Set(Array.from(ctx.characterMemories, (m,) => m.id,),);
        ctx.memorySelectAllBtn!.textContent = "Deselect All";
      }
      renderMemoryList(ctx,);
    },);
  }
}
