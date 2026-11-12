// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Style picker for /regen and /rewrite (FEAT-style-picker-ui-for-smart-regen).
 *
 * A per-message dropdown with two vocabularies: the smart-regen transforms
 * (regenerate the message as a new variant carrying the style hint — the same
 * seam `regenerateVariant` already forwards) and the /rewrite styles (stage
 * `/rewrite --style <style>` in the composer, mirroring the command palette's
 * selectCommand flow — the command targets the last assistant message on
 * send).
 *
 * The vocabularies mirror the backend sources: `REGEN_STYLES` mirrors the
 * keys of `src/generation/smart-regen.ts` `VALID_REGEN_STYLES`, and
 * `REWRITE_STYLES` mirrors the /rewrite valve default plus `rewriteText`'s
 * local-heuristic styles. The component test pins that parity so backend
 * drift fails the suite instead of surfacing as a dead style option.
 */

import type { ChatState, } from "./chat-types";
import type { StyleOption, StylePickerState, } from "./chat-types/style-picker-state";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "chat-style-picker", },);

/** Smart-regen transform names (mirrors `VALID_REGEN_STYLES` keys). */
export const REGEN_STYLES = ["shorter", "longer", "funnier", "darker", "formal", "casual",] as const;

/** /rewrite style names (mirrors the rewrite valve default + heuristics). */
export const REWRITE_STYLES = ["clear", "concise", "dramatic", "formal",] as const;

/** CamelCase i18n label key for a style id (`shorter` → `chats.styleShorter`). */
function styleLabelKey(id: string,): string {
  return `chats.style${id.charAt(0,).toUpperCase()}${id.slice(1,)}`;
}

/** Picker entries in display order; labels resolve through i18n at render. */
const REGEN_STYLE_OPTIONS: StyleOption[] = REGEN_STYLES.map((id,) => ({ id, labelKey: styleLabelKey(id,), }));
const REWRITE_STYLE_OPTIONS: StyleOption[] = REWRITE_STYLES.map((id,) => ({ id, labelKey: styleLabelKey(id,), }));

/** Anchor rect shape used for viewport clamping. */
interface AnchorRect {
  left: number;
  top: number;
  bottom: number;
  width: number;
}

/**
 * Resolve the positioning anchor: the opener's rect when it is still laid
 * out (a direct action-row button), else the message bubble (a menu item
 * that already left the layout reports an empty rect).
 * @param messageId - Message the picker is anchored to
 * @param event - The opener's click event
 * @returns the anchor rect, or null when neither source is measurable
 */
function anchorRect(messageId: string, event: Event,): AnchorRect | null {
  const openerRect = (event.target as HTMLElement | null)?.getBoundingClientRect?.();
  if (openerRect && openerRect.width > 0) { return openerRect; }

  const bubble = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId,)}"]`,);
  return bubble?.getBoundingClientRect?.() ?? null;
}

type StylePickerCtx = ChatState & StylePickerState;

export const chatStylePicker: Partial<ChatState> & ThisType<StylePickerCtx> = {
  _stylePicker: { visible: false, messageId: null, x: 0, y: 0, },
  regenStyleOptions: REGEN_STYLE_OPTIONS,
  rewriteStyleOptions: REWRITE_STYLE_OPTIONS,

  openStylePicker(messageId: string, event: Event,) {
    const rect = anchorRect(messageId, event,);
    const x = rect ? Math.min(rect.left + 8, window.innerWidth - 260,) : 24;
    const y = rect ? Math.min(rect.bottom + 6, window.innerHeight - 340,) : 24;
    this._stylePicker = {
      visible: true,
      messageId,
      x: Math.max(x, 8,),
      y: Math.max(y, 8,),
    };

    log.info("openStylePicker", { messageId, },);
  },

  closeStylePicker() {
    if (!this._stylePicker.visible) { return; }
    this._stylePicker.visible = false;
    // Return focus to the opener that launched this picker so keyboard users
    // land back where they started (mouse path unaffected).
    void this.$nextTick?.(() => {
      const id = this._stylePicker.messageId;
      if (!id) { return; }
      document
        .querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id,)}"] [data-testid="regen-with-style"]`,)
        ?.focus();
    },);
  },

  async regenerateWithStyle(messageId: string | null, style: string,) {
    if (!messageId) { return; }
    this.closeStylePicker();
    await this.regenerateVariant(messageId, style,);
  },

  stageRewriteStyle(style: string,) {
    const input = this.$refs?.messageInput as HTMLTextAreaElement | undefined;
    this.closeStylePicker();
    if (!input) { return; }
    input.value = `/rewrite --style ${style} `;
    input.focus();
  },
};
