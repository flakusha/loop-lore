// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Portrait Manager
 *
 * Manages character portrait positioning in VN mode.
 * Handles left/right/center placement based on message role.
 */

/** */
export type PortraitPosition = "left" | "right" | "center" | "none";

/** */
export interface PortraitConfig {
  /** Character name for display */
  name: string;
  /** Avatar URL (asset ID or direct URL) */
  avatarUrl?: string;
  /** Position in scene */
  position: PortraitPosition;
  /** Size as percentage of scene width (default: 35) */
  sizePercent?: number;
}

/**
 * Determine portrait position based on message role.
 * @param role
 */
export function getPortraitPosition(
  role: "assistant" | "user" | "system" | "narration",
): PortraitPosition {
  switch (role) {
    case "assistant": {
      return "left";
    }
    case "user": {
      return "right";
    }
    case "system":
    case "narration": {
      return "center";
    }
    default: {
      return "none";
    }
  }
}

/**
 * Build a portrait URL from an asset ID.
 * @param assetId
 */
export function getPortraitUrl(assetId?: string | null,): string | undefined {
  if (!assetId) { return undefined; }
  // If it's already a full URL, return as-is
  if (assetId.startsWith("http",) || assetId.startsWith("/",)) { return assetId; }
  // Otherwise, assume it's an asset ID
  return `/api/assets/${assetId}/thumb`;
}

/**
 * Create a portrait element positioned in the scene.
 * @param config
 */
export function createPortraitElement(config: PortraitConfig,): HTMLElement {
  const el = document.createElement("div",);
  el.className = `vn-portrait vn-portrait-${config.position}`;

  const size = config.sizePercent ?? 35;
  el.style.width = `${size}%`;

  if (config.avatarUrl) {
    const img = document.createElement("img",);
    img.src = config.avatarUrl;
    img.alt = config.name;
    img.className = "vn-portrait-img";
    img.loading = "lazy";
    el.append(img,);
  }

  const label = document.createElement("div",);
  label.className = "vn-portrait-name";
  label.textContent = config.name;
  el.append(label,);

  return el;
}

/**
 * Apply portrait positioning CSS to a scene container.
 * @param sceneEl
 * @param position
 * @param splitRatio
 */
export function applyPortraitLayout(
  sceneEl: HTMLElement,
  position: PortraitPosition,
  splitRatio = 40,
): void {
  // Clear existing portrait classes
  sceneEl.classList.remove("vn-layout-split", "vn-layout-overlay", "vn-layout-below",);

  if (position === "center" || position === "none") {
    sceneEl.style.gridTemplateColumns = "";
    return;
  }

  sceneEl.classList.add("vn-layout-split",);
  sceneEl.style.gridTemplateColumns = position === "left"
    ? `${splitRatio}% 1fr`
    : `1fr ${splitRatio}%`;
}
