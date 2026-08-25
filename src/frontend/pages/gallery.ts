// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Gallery page: search + type filter ────────────────────────
// Preview modal and its actions (openAssetPreview, copyAssetUrl,
// downloadAsset, deleteAssetPreview) live in ../asset-preview.ts (core
// bundle) so every page shares one implementation.

import { filterCards, } from "./shared";

globalThis.filterAssets = function() {
  const query = document.querySelector<HTMLInputElement>("#asset-search",)?.value ?? "";
  const type = document.querySelector<HTMLSelectElement>("#asset-type-filter",)?.value ?? "all";
  filterCards({
    containerId: "#asset-grid",
    cardSelector: ".asset-card",
    nameSelector: ".name",
    descSelector: ".type",
    query,
    emptyIcon: "📁",
    emptyTitle: "No assets match your filters",
    emptyStyle: "grid-column: 1 / -1;",
    matchExtra: (card,) =>
      type === "all" ||
      (card.querySelector(".file-icon",)?.textContent === "🎵" && type === "audio") ||
      (card.querySelector(".file-icon",)?.textContent === "🎬" && type === "video") ||
      (!!card.querySelector("img",) && type === "image"),
  },);
};
