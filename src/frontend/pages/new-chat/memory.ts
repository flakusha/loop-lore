import { feFetch, } from "../../fe-fetch";
import { escapeHtml, } from "../shared";
import { estimateTokens, } from "./helpers";
import type { NewChatCtx, } from "./state";

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

  const checkboxLabels: string[] = [];
  for (const m of ctx.characterMemories) {
    const checked = ctx.selectedMemoryIds.has(m.id,) ? "checked" : "";
    const preview = m.content.length > 80 ? `${m.content.slice(0, 80,)}...` : m.content;
    checkboxLabels.push(
      `<label style="display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-1) 0; font-size: 12px; cursor: pointer; border-bottom: 1px solid var(--border-default, #f0f0f0)">
          <input type="checkbox" value="${m.id}" ${checked} onchange="window._toggleMemorySelect('${m.id}', this.checked)" style="margin-top: 2px" />
          <div>
            <div style="color: var(--text-primary)">${escapeHtml(preview,)}</div>
            <div style="font-size: 10px; color: var(--text-secondary)">${m.type} · ${m.tokens} tokens${
        m.pinned ? " · 📌" : ""
      }</div>
          </div>
        </label>`,
    );
  }
  ctx.memoryCheckboxList.innerHTML = checkboxLabels.join("",);
}

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
