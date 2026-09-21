// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Partials fetch helper ───────────────────────────────────
// Partials routes require HX-Request header to prevent direct navigation

import { log as rootLog, } from "../alpine/logger";
import { feFetch, } from "../fe-fetch";

const log = rootLog.child({ module: "shared", },);
const PARTIALS_HEADERS = { "HX-Request": "true", } as const;

/**
 * @param path
 */
export async function fetchPartial(path: string,): Promise<string | null> {
  const resp = await feFetch(path, { headers: PARTIALS_HEADERS, },);
  if (!resp.ok) {
    log.error(`Failed to load partial ${path}`, undefined, { status: resp.status, },);
    return null;
  }
  return resp.text();
}

/**
 * @param str
 */
export function escapeHtml(str: string,): string {
  const div = document.createElement("div",);
  div.textContent = str;
  return div.getHTML();
}

/**
 * @param bytes
 */
export function formatSize(bytes: number,): string {
  if (!bytes) { return ""; }
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
}

// ── Card grid filtering ─────────────────────────────────────
// Shared by character/world/asset list pages. Each page supplies its own
// container + selectors + empty-state copy; an optional `matchExtra` predicate
// layers on secondary filters (e.g. asset type).

/** */
export interface FilterCardsOptions {
  containerId: string;
  cardSelector: string;
  nameSelector: string;
  descSelector: string;
  query: string;
  emptyIcon: string;
  emptyTitle: string;
  emptyStyle?: string;
  matchExtra?: (card: Element,) => boolean;
}

/**
 * @param opts
 */
export function filterCards(opts: FilterCardsOptions,): void {
  const query = opts.query.toLowerCase().trim();
  const cards = document.querySelectorAll(`${opts.containerId} ${opts.cardSelector}`,);
  let visible = 0;
  for (const card of cards) {
    const name = (card.querySelector(opts.nameSelector,)?.textContent ?? "").toLowerCase();
    const desc = (card.querySelector(opts.descSelector,)?.textContent ?? "").toLowerCase();
    const match = (!query || name.includes(query,) || desc.includes(query,)) &&
      (opts.matchExtra ? opts.matchExtra(card,) : true);
    (card as HTMLElement).style.display = match ? "" : "none";
    if (match) { visible++; }
  }
  if (visible === 0 && cards.length > 0) {
    const container = document.querySelector(opts.containerId,);
    if (container && !container.querySelector(".empty-state",)) {
      const empty = document.createElement("div",);
      empty.className = "empty-state";
      if (opts.emptyStyle) { empty.style.cssText = opts.emptyStyle; }
      else { empty.style.padding = "var(--space-12)"; }
      empty.innerHTML = `<div class="icon">${escapeHtml(opts.emptyIcon,)}</div><div class="title">${
        escapeHtml(opts.emptyTitle,)
      }</div>`;
      container.append(empty,);
    }
  }
}

// ── Actor/participant search (new-chat page) ────────────────

/**
 * @param actors
 * @param q
 * @param limit
 */
export function filterActors(actors: any[], q: string, limit = 20,): any[] {
  const query = q.toLowerCase().trim();
  if (!query) { return []; }
  const out: any[] = [];
  for (const a of actors) {
    const name = (a.display_name || a.name || "").toLowerCase();
    const desc = (a.description || "").toLowerCase();
    if (name.includes(query,) || desc.includes(query,)) {
      out.push(a,);
      if (out.length >= limit) { break; }
    }
  }
  return out;
}

// ── Error-to-toast helper ───────────────────────────────────
// Reads a JSON error body and falls back to a default message. Used everywhere
// a failed API call is surfaced to the user.

/**
 * @param res
 * @param fallback
 */
export async function getErrorMessage(res: Response, fallback: string,): Promise<string> {
  try {
    const e = await res.json();
    return e?.message || e?.error || fallback;
  } catch {
    return fallback;
  }
}

// ── Filter Bar Alpine Component ──────────────────────────────
// Used by filter-bar.html. Manages search query, type/sort/tag filters.
// Triggers HTMX request via data attributes on parent:
//   data-search-url="/dynamic/gallery/search"
//   data-target-id="asset-grid"
// The tag facet is opt-in: render the partial inside a
// `data-show-tag-filter="true"` wrapper to fetch the caller-visible vocabulary
// and enable the `tag` param.

interface FilterChip {
  key: string;
  label: string;
}

/** */
export interface FilterBarState {
  query: string;
  typeFilter: string;
  sortBy: string;
  tagFilter: string;
  tagOptions: string[];
  activeChips: FilterChip[];
  init(): void;
  triggerSearch(): void;
  removeChip(key: string,): void;
  clearAll(): void;
}

globalThis.filterBar = function() {
  return {
    query: "",
    typeFilter: "all",
    sortBy: "name",
    tagFilter: "all",
    tagOptions: [] as string[],
    init(): void {
      const el = (this as unknown as { $el: HTMLElement }).$el;
      if (el.closest<HTMLElement>("[data-show-tag-filter]",)?.dataset.showTagFilter !== "true") { return; }
      void (async () => {
        try {
          const res = await feFetch("/api/v1/tag-autocomplete",);
          if (!res.ok) { return; }
          const { tags, } = (await res.json()) as { tags: string[] };
          (this as unknown as { tagOptions: string[] }).tagOptions = tags;
        } catch {
          // Vocabulary stays empty; the facet still renders with "all".
        }
      })();
    },
    get activeChips(): FilterChip[] {
      const chips: FilterChip[] = [];
      if (this.query) { chips.push({ key: "q", label: `"${this.query}"`, },); }
      if (this.typeFilter !== "all") { chips.push({ key: "type", label: this.typeFilter, },); }
      if (this.sortBy !== "name") { chips.push({ key: "sort", label: this.sortBy, },); }
      if (this.tagFilter !== "all") { chips.push({ key: "tag", label: this.tagFilter, },); }
      return chips;
    },
    triggerSearch(): void {
      const el = (this as unknown as { $el: HTMLElement }).$el;
      const searchUrl = el.closest<HTMLElement>("[data-search-url]",)?.dataset.searchUrl ?? "/dynamic/gallery/search";
      const targetId = el.closest<HTMLElement>("[data-target-id]",)?.dataset.targetId ?? "asset-grid";
      const params = new URLSearchParams();
      if (this.query) { params.set("q", this.query,); }
      if (this.typeFilter !== "all") { params.set("type", this.typeFilter,); }
      if (this.sortBy !== "name") { params.set("sort", this.sortBy,); }
      if (this.tagFilter !== "all") { params.set("tag", this.tagFilter,); }
      const url = `${searchUrl}?${params.toString()}`;
      globalThis.htmx.ajax("GET", url, { target: `#${targetId}`, swap: "innerHTML", },);
    },
    removeChip(key: string,): void {
      if (key === "q") { this.query = ""; }
      if (key === "type") { this.typeFilter = "all"; }
      if (key === "sort") { this.sortBy = "name"; }
      if (key === "tag") { this.tagFilter = "all"; }
      this.triggerSearch();
    },
    clearAll(): void {
      this.query = "";
      this.typeFilter = "all";
      this.sortBy = "name";
      this.tagFilter = "all";
      this.triggerSearch();
    },
  };
};
