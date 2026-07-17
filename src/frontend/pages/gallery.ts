// ── Gallery page: search, preview, actions ────────────────────
import { escapeHtml, formatSize, filterCards } from "./shared";
import { feFetch } from "../fe-fetch";
import { showToast } from "../ui";
import { log as rootLog } from "../alpine/logger";

const pageLog = rootLog.child({ module: "gallery" });

globalThis.filterAssets = function () {
  const query = document.querySelector<HTMLInputElement>("#asset-search")?.value ?? "";
  const type = document.querySelector<HTMLSelectElement>("#asset-type-filter")?.value ?? "all";
  filterCards({
    containerId: "#asset-grid",
    cardSelector: ".asset-card",
    nameSelector: ".name",
    descSelector: ".type",
    query,
    emptyIcon: "📁",
    emptyTitle: "No assets match your filters",
    emptyStyle: "grid-column: 1 / -1;",
    matchExtra: (card) =>
      type === "all" ||
      (card.querySelector(".file-icon")?.textContent === "🎵" && type === "audio") ||
      (card.querySelector(".file-icon")?.textContent === "🎬" && type === "video") ||
      (!!card.querySelector("img") && type === "image"),
  });
};

globalThis.openAssetPreview = async function (id: string) {
  pageLog.debug("openAssetPreview", { id });
  try {
    const res = await feFetch(`/api/assets/${id}`);
    if (!res.ok) return;
    const a = await res.json();
    globalThis.__previewAsset = a;
    const modal = document.querySelector<HTMLElement>("#preview-modal");
    if (!modal) return;
    modal.querySelector("[data-field='filename']")!.textContent = a.filename || "Asset";
    modal.querySelector("[data-field='mime']")!.textContent = a.mime_type || "";
    modal.querySelector("[data-field='size']")!.textContent = formatSize(a.size_bytes);
    const body = modal.querySelector("[data-field='preview-body']")!;
    switch (a.asset_type) {
      case "image": {
        body.innerHTML = `<img src="/api/assets/${a.id}/raw" alt="${escapeHtml(a.filename)}" style="width:100%;display:block" />`;
        break;
      }
      case "audio": {
        body.innerHTML = `<audio controls style="width:100%;padding:var(--space-6)"><source src="/api/assets/${a.id}/raw" /></audio>`;
        break;
      }
      case "video": {
        body.innerHTML = `<video controls style="width:100%;display:block"><source src="/api/assets/${a.id}/raw" /></video>`;
        break;
      }
      default: {
        body.innerHTML = `<div style="padding:var(--space-6);text-align:center"><div class="file-icon" style="font-size:48px">📄</div></div>`;
      }
    }
    modal.classList.add("open");
  } catch {
    /* ignore */
  }
};

globalThis.copyAssetUrl = async function () {
  const a = globalThis.__previewAsset;
  if (!a?.id) return;
  try {
    await navigator.clipboard.writeText(`${location.origin}/api/assets/${a.id}/raw`);
    showToast("success", "URL copied");
  } catch {
    showToast("error", "Failed to copy");
  }
};

globalThis.downloadAsset = function () {
  const a = globalThis.__previewAsset;
  if (!a?.id) return;
  const el = document.createElement("a");
  el.href = `/api/assets/${a.id}/raw`;
  el.download = a.filename || "asset";
  el.click();
};

globalThis.deleteAssetPreview = async function () {
  const a = globalThis.__previewAsset;
  if (!a?.id || !confirm("Delete this asset?")) return;
  try {
    const res = await feFetch(`/api/assets/${a.id}`, { method: "DELETE" });
    if (res.ok) {
      document.querySelector("#preview-modal")?.classList.remove("open");
      globalThis.__previewAsset = null;
      showToast("success", "Asset deleted");
      const grid = document.querySelector("#asset-grid");
      if (grid) htmx.trigger(grid, "load");
    }
  } catch {
    showToast("error", "Failed to delete");
  }
};
