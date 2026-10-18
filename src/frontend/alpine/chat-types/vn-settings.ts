// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Visual-novel mode settings (layout, transitions, stage sizing) — persisted
 * to `gm_config`, same store as the GM block in ./gm-settings.ts.
 */
export interface ChatCoreVnSettingsState {
  // VN (visual novel) mode settings — persisted to gm_config.
  _vnEnabled: boolean;
  _vnLayout: "overlay" | "below" | "split";
  _vnTypewriter: boolean;
  _vnTypewriterSpeed: number;
  _vnTransition: "fade" | "cut" | "dissolve" | "slide" | "wipe";
  _vnAutoAdvance: boolean;
  /** Per-chat opt-in for VN branching choices and Q&A cards. */
  _vnChoicesEnabled: boolean;
  /** VN image scaling (contain/cover/fill/auto). */
  _imageScaling: "contain" | "cover" | "fill" | "auto";
  /** VN auto-advance delay in seconds. */
  _autoAdvanceDelay: number;
  /** VN dialogue-box opacity (0–1, overlay layout). */
  _dialogueBoxOpacity: number;
  /** VN portrait size as percentage of scene width. */
  _portraitSize: number;
  /** VN portrait:text split ratio (split layout). */
  _splitRatio: number;
  /** Last VN QA report (transient — never persisted to gm_config). */
  _vnQaReport: import("../../vn/qa-mode").VnQaReport | null;
  /** VN QA surface error text (transient). */
  _vnQaError: string;
}
