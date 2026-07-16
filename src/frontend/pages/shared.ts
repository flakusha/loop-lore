export function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

// ── Filter Bar Alpine Component ──────────────────────────────
// Used by filter-bar.html. Manages search query, type/sort filters.
// Triggers HTMX request via data attributes on parent:
//   data-search-url="/dynamic/gallery/search"
//   data-target-id="asset-grid"

interface FilterChip {
  key: string;
  label: string;
}

interface FilterBarState {
  query: string;
  typeFilter: string;
  sortBy: string;
  activeChips: FilterChip[];
  triggerSearch(): void;
  removeChip(key: string): void;
  clearAll(): void;
}

(globalThis as any).filterBar = function () {
  return {
    query: "",
    typeFilter: "all",
    sortBy: "name",
    get activeChips(): FilterChip[] {
      const chips: FilterChip[] = [];
      if (this.query) chips.push({ key: "q", label: `"${this.query}"` });
      if (this.typeFilter !== "all") chips.push({ key: "type", label: this.typeFilter });
      if (this.sortBy !== "name") chips.push({ key: "sort", label: this.sortBy });
      return chips;
    },
    triggerSearch(): void {
      const el = (this as any).$el as HTMLElement;
      const searchUrl =
        el.closest<HTMLElement>("[data-search-url]")?.dataset.searchUrl ?? "/dynamic/gallery/search";
      const targetId = el.closest<HTMLElement>("[data-target-id]")?.dataset.targetId ?? "asset-grid";
      const params = new URLSearchParams();
      if (this.query) params.set("q", this.query);
      if (this.typeFilter !== "all") params.set("type", this.typeFilter);
      if (this.sortBy !== "name") params.set("sort", this.sortBy);
      const url = `${searchUrl}?${params.toString()}`;
      htmx.ajax("GET", url, { target: `#${targetId}`, swap: "innerHTML" } as any);
    },
    removeChip(key: string): void {
      if (key === "q") this.query = "";
      if (key === "type") this.typeFilter = "all";
      if (key === "sort") this.sortBy = "name";
      this.triggerSearch();
    },
    clearAll(): void {
      this.query = "";
      this.typeFilter = "all";
      this.sortBy = "name";
      this.triggerSearch();
    },
  };
};
