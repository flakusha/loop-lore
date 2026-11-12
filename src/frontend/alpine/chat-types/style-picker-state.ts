// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * One style-picker entry: the style id sent to the backend plus the i18n
 * label key resolved at render time (the labels depend on the loop item, so
 * they cannot be baked server-side).
 */
export interface StyleOption {
  id: string;
  labelKey: string;
}

/**
 * Regeneration/rewrite style-picker slice of chat state
 * (FEAT-style-picker-ui-for-smart-regen): a per-message dropdown exposing the
 * smart-regen transforms (regenerate as a variant carrying the style hint)
 * and the /rewrite style vocabulary (stage `/rewrite --style <style>` in the
 * composer — the command targets the last assistant message on send).
 */
export interface StylePickerState {
  /** Viewport-fixed picker state; `visible` is false while closed. */
  _stylePicker: { visible: boolean; messageId: string | null; x: number; y: number };
  /** Smart-regen transform vocabulary (mirrors `VALID_REGEN_STYLES` keys). */
  readonly regenStyleOptions: StyleOption[];
  /** /rewrite style vocabulary (mirrors the rewrite valve + heuristics). */
  readonly rewriteStyleOptions: StyleOption[];

  /**
   * Open the style picker anchored to one message. The opener's rect
   * positions the picker; when the opener has already left the layout (a
   * closing menu item), the message bubble anchors instead.
   * @param messageId - Message the picker regenerates
   * @param event - The opener button's click event (positioning anchor)
   */
  openStylePicker(messageId: string, event: Event,): void;
  /** Close the style picker and return focus to the opener button. */
  closeStylePicker(): void;
  /**
   * Regenerate a message as a new variant with a style hint, then close.
   * @param messageId - Message to regenerate
   * @param style - Smart-regen style (shorter|longer|funnier|darker|formal|casual)
   */
  regenerateWithStyle(messageId: string | null, style: string,): Promise<void>;
  /**
   * Stage `/rewrite --style <style>` in the composer (the command targets the
   * last assistant message on send), mirroring the command palette's select
   * flow — the user reviews and sends with Enter — then close.
   * @param style - Rewrite style (clear|concise|dramatic|formal)
   */
  stageRewriteStyle(style: string,): void;
}
