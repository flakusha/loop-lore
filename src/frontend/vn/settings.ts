// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Visual Novel Mode Settings
 *
 * Manages VN mode preferences per-chat. Reads from GmConfig and localStorage.
 */

import { jsonParseOr, jsonStringifyOr, } from "../../utils";

/** */
export interface VnSettings {
  enabled: boolean;
  layout: "overlay" | "below" | "split";
  imageScaling: "contain" | "cover" | "fill" | "auto";
  transition: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  typewriter: boolean;
  typewriterSpeed: number;
  autoAdvance: boolean;
  autoAdvanceDelay: number;
  dialogueBoxOpacity: number;
  portraitSize: number;
  splitRatio: number;
}

const STORAGE_KEY = "vn-settings";

const DEFAULTS: VnSettings = {
  enabled: false,
  layout: "overlay",
  imageScaling: "auto",
  transition: "fade",
  typewriter: true,
  typewriterSpeed: 30,
  autoAdvance: false,
  autoAdvanceDelay: 5,
  dialogueBoxOpacity: 0.75,
  portraitSize: 35,
  splitRatio: 40,
};

/**
 * Get VN settings, merging GmConfig with localStorage overrides.
 * @param gmConfig
 */
export function getVnSettings(gmConfig?: Record<string, unknown>,): VnSettings {
  const stored = loadFromStorage();

  return {
    enabled: Boolean(gmConfig?.visualNovel ?? stored.enabled,),
    layout: (gmConfig?.vnLayout as VnSettings["layout"]) ?? stored.layout ?? DEFAULTS.layout,
    imageScaling: (gmConfig?.vnImageScaling as VnSettings["imageScaling"]) ?? stored.imageScaling ??
      DEFAULTS.imageScaling,
    transition: (gmConfig?.vnTransition as VnSettings["transition"]) ?? stored.transition ?? DEFAULTS.transition,
    typewriter: (gmConfig?.vnTypewriter as boolean) ?? stored.typewriter ?? DEFAULTS.typewriter,
    typewriterSpeed: (gmConfig?.vnTypewriterSpeed as number) ?? stored.typewriterSpeed ?? DEFAULTS.typewriterSpeed,
    autoAdvance: (gmConfig?.vnAutoAdvance as boolean) ?? stored.autoAdvance ?? DEFAULTS.autoAdvance,
    autoAdvanceDelay: (gmConfig?.vnAutoAdvanceDelay as number) ?? stored.autoAdvanceDelay ?? DEFAULTS.autoAdvanceDelay,
    dialogueBoxOpacity: (gmConfig?.vnDialogueBoxOpacity as number) ?? stored.dialogueBoxOpacity ??
      DEFAULTS.dialogueBoxOpacity,
    portraitSize: (gmConfig?.vnPortraitSize as number) ?? stored.portraitSize ?? DEFAULTS.portraitSize,
    splitRatio: (gmConfig?.vnSplitRatio as number) ?? stored.splitRatio ?? DEFAULTS.splitRatio,
  };
}

/**
 * Save VN settings to localStorage.
 * @param settings
 */
export function saveVnSettings(settings: Partial<VnSettings>,): void {
  const current = getVnSettings();
  const merged = { ...current, ...settings, };
  try {
    localStorage.setItem(STORAGE_KEY, jsonStringifyOr(merged,),);
  } catch { /* ignore quota errors */ }
}

/**
 * Reset VN settings to defaults.
 */
export function resetVnSettings(): void {
  try {
    localStorage.removeItem(STORAGE_KEY,);
  } catch { /* ignore */ }
}

/** */
function loadFromStorage(): Partial<VnSettings> {
  const raw = localStorage.getItem(STORAGE_KEY,);
  return raw ? jsonParseOr(raw, {},) : {};
}
