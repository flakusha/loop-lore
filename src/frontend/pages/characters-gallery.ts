// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character detail-modal gallery tab (epic-character-growth).
 *
 * Split from ./characters.ts to stay under the size gate. Loads the
 * character's linked gallery assets (avatars) and re-exports
 * `loadCharacterGallery` so `unlinkCharacterAsset` keeps refreshing the
 * same tab after an unlink.
 */

import { feFetch, } from "../fe-fetch";
import { escapeHtml, } from "./shared";

/**
 * Load the character's linked gallery assets (avatars) into the modal's Gallery tab.
 * @param modal
 * @param id
 */
export async function loadCharacterGallery(modal: HTMLElement, id: string,): Promise<void> {
  const container = modal.querySelector<HTMLElement>("[data-field='gallery']",);

  if (!container) { return; }
  try {
    const resp = await feFetch(`/api/v1/actors/${id}/avatars`,);
    const avatars = await resp.json() as Array<{ id: string; assetId: string; label: string }>;

    if (!Array.isArray(avatars,) || avatars.length === 0) {
      container.innerHTML = "<div data-field='gallery-empty'>No linked assets.</div>";

      return;
    }

    container.innerHTML = Array.from(
      avatars,
      (av,) =>
        `<div class="avatar-gallery-item" style="display:flex;flex-direction:column;align-items:center;gap:var(--space-1)">
      <div style="width:56px;height:56px;border-radius:var(--radius-sm);overflow:hidden;background:var(--bg-tertiary);border:1px solid var(--border-default)">
        <img src="/api/v1/assets/${escapeHtml(av.assetId,)}/thumb" alt="${
          escapeHtml(av.label || "avatar",)
        }" style="width:100%;height:100%;object-fit:cover" />
      </div>
      <span style="font-size:var(--fs-base-xs);color:var(--text-secondary);max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${
          escapeHtml(av.label || "",)
        }</span>
      <button class="btn btn-ghost btn-sm" data-action="unlink-asset" data-asset-id="${
          escapeHtml(av.assetId,)
        }" data-actor-id="${
          escapeHtml(id,)
        }" x-on:click="window.unlinkCharacterAsset($el)" title="Unlink from character">\u2715 Unlink</button>
    </div>`,
    ).join("",);
  } catch {
    container.innerHTML = "<div data-field='gallery-empty'>Failed to load gallery.</div>";
  }
}
