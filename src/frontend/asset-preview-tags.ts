// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 282

/**
 * Gallery tagging (G7) frontend: renders the tag chips with add/remove/rename
 * via the preview modal, the metadata tag-proposition feed, and autocomplete.
 *
 * Split from `asset-preview.ts` to keep the preview bundle under the file-size
 * gate; `renderTagsPanel` is the single entry point called from
 * `openAssetPreview`.
 */
import { jsonStringifyOr, } from "../utils";
import { feFetch, } from "./fe-fetch";

interface PreviewTag {
  id: string;
  tag: string;
  scope: "user" | "global";
  source: "manual" | "rag";
}

interface TagProposition {
  tag: string;
  provenance: "alt_text" | "filename";
}

/**
 * @param s
 */
function escapeHtml(s: string,): string {
  return s.replace(/[&<>"']/g, (c,) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  },);
}

/** Render the tag chips, input, and proposition feed into the preview modal. */
export async function renderTagsPanel(assetId: string,): Promise<void> {
  const panel = document.querySelector<HTMLElement>("[data-field='tags-panel']",);
  if (!panel) { return; }

  const tagsRes = await feFetch(`/api/assets/${assetId}/tags`,).catch(() => null);
  const propRes = await feFetch(`/api/assets/${assetId}/tag-propositions`,).catch(() => null);

  const tags: PreviewTag[] = tagsRes?.ok
    ? ((await tagsRes.json()).tags as PreviewTag[] | undefined) ?? []
    : [];
  const propositions: TagProposition[] = propRes?.ok
    ? ((await propRes.json()).propositions as TagProposition[] | undefined) ?? []
    : [];

  panel.innerHTML = `<div style="padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border);">
    <div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-2)">${
    tags.map((tag,): string =>
      '<span class="tag" data-testid="asset-tag-' + escapeHtml(tag.tag,) + '">' + escapeHtml(tag.tag,) +
      (tag.scope === "global" ? ' <span class="tag-scope">global</span>' : "") +
      (tag.scope === "user"
        ? '<button type="button" class="tag-rename" data-rename-tag="' + escapeHtml(tag.tag,) +
          '" data-scope="user">\u270e</button>'
        : "") +
      '<button type="button" class="tag-remove" data-remove-tag="' + escapeHtml(tag.tag,) + '" data-scope="' +
      escapeHtml(tag.scope,) + '">&times;</button></span>'
    ).join("",)
  }</div>${
    propositions.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:var(--space-2);margin-bottom:var(--space-2)">${
        propositions
          .map((p,): string =>
            '<span class="tag tag-proposal" data-testid="asset-proposal-' + escapeHtml(p.tag,) + '">' +
            escapeHtml(p.tag,) +
            (p.provenance === "alt_text" ? ' <span class="tag-source">alt</span>' : "") +
            '<button type="button" class="tag-proposal-accept" data-accept-tag="' + escapeHtml(p.tag,) +
            '">\u2713</button><button type="button" class="tag-proposal-dismiss" data-dismiss-tag="' +
            escapeHtml(p.tag,) + '">&times;</button></span>'
          ).join("",)
      }</div>`
      : ""
  }
    <form data-tag-form style="display:flex;gap:var(--space-2)">
      <input type="text" name="tag" data-tag-input placeholder="Add tag\u2026" autocomplete="off" style="flex:1" />
      <label style="display:flex;align-items:center;gap:var(--space-1);font-size:12px"><input type="checkbox" name="global" data-tag-global /> global</label>
      <button type="submit" class="btn btn-ghost">Add</button>
    </form>
    <div data-tag-edit style="display:none;margin-top:var(--space-2)"></div>
    <div data-autocomplete style="display:none;flex-wrap:wrap;gap:var(--space-1);margin-top:var(--space-2)"></div>
  </div>`;

  const form = panel.querySelector<HTMLFormElement>("[data-tag-form]",)!;
  const input = panel.querySelector<HTMLInputElement>("[data-tag-input]",)!;
  const ac = panel.querySelector<HTMLElement>("[data-autocomplete]",)!;

  form.addEventListener("submit", async (e,) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) { return; }
    const globalEl = panel.querySelector<HTMLInputElement>("[data-tag-global]",)!;
    await submitTag(assetId, value, globalEl.checked ? "global" : "user",);
  },);

  panel.querySelectorAll<HTMLButtonElement>("[data-remove-tag]",).forEach((btn,) => {
    btn.addEventListener("click", () => {
      void removeTag(assetId, btn.dataset.removeTag!, btn.dataset.scope as "user" | "global",);
    },);
  },);

  const edit = panel.querySelector<HTMLElement>("[data-tag-edit]",)!;
  panel.querySelectorAll<HTMLButtonElement>("[data-rename-tag]",).forEach((btn,) => {
    btn.addEventListener("click", () => {
      showRenameEditor(assetId, btn.dataset.renameTag!, edit,);
    },);
  },);

  panel.querySelectorAll<HTMLButtonElement>("[data-accept-tag]",).forEach((btn,) => {
    btn.addEventListener("click", () => void submitTag(assetId, btn.dataset.acceptTag!, "user",),);
  },);

  panel.querySelectorAll<HTMLButtonElement>("[data-dismiss-tag]",).forEach((btn,) => {
    btn.addEventListener("click", () => void dismissTag(assetId, btn.dataset.dismissTag!,),);
  },);

  let debounce: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => {
    clearTimeout(debounce,);
    debounce = setTimeout(() => void renderAutocomplete(input.value, ac,), 120,);
  },);
}

/**
 * Swap the edit slot to an inline rename form for `oldTag`. Submitting posts
 * the rename and re-renders the panel (which resets the slot).
 * @param assetId
 * @param oldTag
 * @param slot
 */
function showRenameEditor(assetId: string, oldTag: string, slot: HTMLElement,): void {
  slot.style.display = "flex";
  slot.innerHTML = `<form data-rename-form style="display:flex;gap:var(--space-2);width:100%">
      <input type="text" name="newTag" data-rename-input value="${
    escapeHtml(oldTag,)
  }" autocomplete="off" style="flex:1" />
      <button type="submit" class="btn btn-ghost">Rename</button>
    </form>`;
  const form = slot.querySelector<HTMLFormElement>("[data-rename-form]",)!;
  form.addEventListener("submit", async (e,) => {
    e.preventDefault();
    const input = form.querySelector<HTMLInputElement>("[data-rename-input]",)!;
    const value = input.value.trim();
    if (!value || value === oldTag) { return; }
    await renameTag(assetId, oldTag, value,);
  },);
}

/**
 * @param query
 * @param container
 */
async function renderAutocomplete(query: string, container: HTMLElement,): Promise<void> {
  const q = query.trim();
  if (q === "") {
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }
  try {
    const res = await feFetch(`/api/tag-autocomplete?q=${encodeURIComponent(q,)}`,);
    if (!res.ok) { return; }
    const { tags, } = (await res.json()) as { tags: string[] };
    container.innerHTML = tags
      .slice(0, 8,)
      .map((t,) =>
        `<button type="button" class="tag" data-autocomplete-tag="${escapeHtml(t,)}">${escapeHtml(t,)}</button>`
      )
      .join("",);
    container.style.display = tags.length > 0 ? "flex" : "none";
    container.querySelectorAll<HTMLButtonElement>("[data-autocomplete-tag]",).forEach((btn,) => {
      btn.addEventListener("click", () => {
        const input = document.querySelector<HTMLInputElement>("[data-tag-input]",)!;
        input.value = btn.dataset.autocompleteTag!;
        container.style.display = "none";
        input.focus();
      },);
    },);
  } catch {
    container.style.display = "none";
  }
}

/**
 * @param assetId
 * @param tag
 * @param scope
 */
async function submitTag(assetId: string, tag: string, scope: "user" | "global",): Promise<void> {
  const { showToast, } = await import("./ui");
  try {
    const res = await feFetch(`/api/assets/${assetId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonStringifyOr({ tag, scope, },),
    },);
    if (!res.ok) { throw new Error("failed",); }
    await renderTagsPanel(assetId,);
  } catch {
    showToast("error", "Failed to add tag",);
  }
}

/**
 * @param assetId
 * @param tag
 * @param scope
 */
async function removeTag(assetId: string, tag: string, scope: "user" | "global",): Promise<void> {
  const { showToast, } = await import("./ui");
  try {
    const res = await feFetch(`/api/assets/${assetId}/tags`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", },
      body: jsonStringifyOr({ tag, scope, },),
    },);
    if (!res.ok) { throw new Error("failed",); }
    await renderTagsPanel(assetId,);
  } catch {
    showToast("error", "Failed to remove tag",);
  }
}

/**
 * Rename a user-scoped tag; the panel re-renders so chips, item detail, and
 * (on next gallery render) filter facets all reflect the new name.
 * @param assetId
 * @param oldTag
 * @param newTag
 */
async function renameTag(assetId: string, oldTag: string, newTag: string,): Promise<void> {
  const { showToast, } = await import("./ui");
  try {
    const res = await feFetch(`/api/assets/${assetId}/tags/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonStringifyOr({ oldTag, newTag, scope: "user", },),
    },);
    if (!res.ok) { throw new Error("failed",); }
    await renderTagsPanel(assetId,);
  } catch {
    showToast("error", "Failed to rename tag",);
  }
}

/**
 * @param assetId
 * @param tag
 */
async function dismissTag(assetId: string, tag: string,): Promise<void> {
  const { showToast, } = await import("./ui");
  try {
    const res = await feFetch(`/api/assets/${assetId}/tag-propositions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", },
      body: jsonStringifyOr({ tag, },),
    },);
    if (!res.ok) { throw new Error("failed",); }
    await renderTagsPanel(assetId,);
  } catch {
    showToast("error", "Failed to dismiss",);
  }
}
