// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Crop anchor percentages consumed by the focus slider section. */
export interface AvatarFocusValues {
  avatarFocusX: number;
  avatarFocusY: number;
}

/**
 * Avatar focus slider section: crop anchor percentages (0-100).
 * @param v - edit form values (avatarFocusX/avatarFocusY)
 * @returns the focus slider HTML
 */
export function avatarFocusSection(v: AvatarFocusValues,): string {
  return `        <div class="form-group"><label class="form-label">Avatar Focus</label>
          <p class="form-hint" style="color:var(--text-secondary)">Where the avatar is anchored when cropped: 0 = left/top edge, 50 = centered, 100 = right/bottom edge.</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">
            <div><label class="form-label" for="edit-avatar-focus-x" style="font-size:var(--text-sm)">Horizontal</label><input type="range" id="edit-avatar-focus-x" min="0" max="100" step="1" value="${v.avatarFocusX}" style="width:100%" x-on:input="window.updateAvatarFocusPreview()" data-testid="avatar-focus-x" /><span id="edit-avatar-focus-x-val" style="font-size:var(--text-xs);color:var(--text-secondary)">${v.avatarFocusX}</span></div>
            <div><label class="form-label" for="edit-avatar-focus-y" style="font-size:var(--text-sm)">Vertical</label><input type="range" id="edit-avatar-focus-y" min="0" max="100" step="1" value="${v.avatarFocusY}" style="width:100%" x-on:input="window.updateAvatarFocusPreview()" data-testid="avatar-focus-y" /><span id="edit-avatar-focus-y-val" style="font-size:var(--text-xs);color:var(--text-secondary)">${v.avatarFocusY}</span></div>
          </div>
        </div>`;
}
