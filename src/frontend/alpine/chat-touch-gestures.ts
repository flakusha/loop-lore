// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat touch gestures — wires `src/frontend/touch.ts` onto the message list
 * (epic-accessibility-input Phase 2).
 *
 * Gesture map (mirrors the epic's mobile table, dispatched through the SAME
 * actions the visible buttons use — no duplicated logic):
 *   swipe left   → archive-confirm dialog (the 📦 Archive button's action)
 *   swipe right  → startEdit() (the ✏️ Edit button's action)
 *   long-press   → openContextMenu() (the right-click / context-menu path)
 *
 * Delegation: listeners live on `#message-list`, captured at setup and
 * released in teardown. htmx swaps re-run Alpine init, so the fresh node is
 * re-attached on the next mount and the removed node keeps no listeners.
 *
 * Guards: listeners only attach on touch-capable devices (touch events or a
 * coarse primary pointer) — desktop mouse drags are unaffected; gestures are
 * no-ops when the touch starts on a control that owns its own interaction
 * (button, link, form field, contenteditable). Every gesture keeps its
 * visible-button alternative, so reduced-motion users lose nothing: the
 * wiring performs no animation of its own.
 */
import { onLongPress, onSwipe, } from "../touch";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat-touch-gestures", },);

/** Minimum horizontal travel (px) before a swipe fires. */
const SWIPE_THRESHOLD_PX = 60;
/** Touches starting inside these never produce gestures. */
const CONTROL_SELECTOR = "input, textarea, select, button, a, [contenteditable='true']";
/** Row selector for delegated swipe/long-press targets. */
const MESSAGE_ROW_SELECTOR = ".message";

/** Narrow capability view of globalThis (keeps the check stubbable in tests). */
type TouchScope = {
  ontouchstart?: unknown;
  matchMedia?: (query: string,) => { matches: boolean };
};

/** Element-or-null view of an Event target that may carry `closest`. */
type MaybeElement = { closest?: (selector: string,) => Element | null } | null | undefined;

/** Explicit no-op (lint-clean empty function) for ignored event phases. */
const noop = (): undefined => undefined;

/**
 * True when the device exposes touch at all (touch events or a coarse primary
 * pointer). Pointer-fine desktop environments never attach listeners.
 * @param scope Capability source; defaults to globalThis.
 * @returns {boolean}
 */
export function isTouchCapable(scope: TouchScope = globalThis as TouchScope,): boolean {
  if ("ontouchstart" in scope) { return true; }
  try {
    return scope.matchMedia?.("(pointer: coarse)",)?.matches ?? false;
  } catch {
    // A throwing matchMedia is a broken embed, not a touch device.
    return false;
  }
}

/** Resolve the message row a touch event points at, or null. */
function messageRowFrom(target: MaybeElement,): Element | null {
  if (typeof target?.closest !== "function") { return null; }
  return target.closest(MESSAGE_ROW_SELECTOR,);
}

export const chatTouchGestures: Partial<ChatState> & ThisType<ChatState> = {
  _touchGesturesEl: null,
  _touchGesturesCleanups: [],
  _touchSwipeTarget: null,
  _touchOnControl: false,

  /**
   * Attach swipe + long-press detection to the live #message-list node.
   * No-op on pointer-fine devices or when the list is absent; safe to call
   * repeatedly (re-setup tears the previous listeners down first).
   * @returns {void}
   */
  setupTouchGestures() {
    this.teardownTouchGestures();
    if (!isTouchCapable()) { return; }
    const list = document.querySelector("#message-list",);
    if (!list) { return; }

    this._touchGesturesEl = list;
    const cleanups: (() => void)[] = [];

    // Delegated swipe targeting: messages re-render freely, so the row a
    // swipe belongs to must be captured at touchstart, not looked up when
    // the gesture completes.
    const trackStart = (e: Event,): void => {
      const target = e.target as MaybeElement;
      this._touchSwipeTarget = messageRowFrom(target,);
      this._touchOnControl = typeof target?.closest === "function" &&
        target.closest(CONTROL_SELECTOR,) !== null;
    };

    list.addEventListener("touchstart", trackStart as EventListener, { passive: true, },);
    cleanups.push(() => list.removeEventListener("touchstart", trackStart as EventListener,));

    cleanups.push(onSwipe(list, {
      threshold: SWIPE_THRESHOLD_PX,
      onSwipe: (direction,) => {
        const msgId = this._touchSwipeTarget?.getAttribute("data-message-id",);
        if (!msgId || this._touchOnControl) { return; }
        if (direction === "left") {
          // The 📦 Archive button's exact action; the confirm dialog still
          // gates the actual archive request.
          this._archiveConfirmId = msgId;
          this._archiveConfirmOpen = true;
          log.debug("gesture: archive requested", { messageId: msgId, },);
        } else if (direction === "right") {
          // The ✏️ Edit button's exact action.
          this.startEdit(msgId,);
          log.debug("gesture: edit requested", { messageId: msgId, },);
        }
      },
    },),);

    cleanups.push(onLongPress(list, {
      onLongPress: (e,) => {
        const target = e.target as MaybeElement;
        if (typeof target?.closest === "function" && target.closest(CONTROL_SELECTOR,)) { return; }
        const msgId = messageRowFrom(target,)?.getAttribute("data-message-id",);
        if (!msgId) { return; }
        const touch = (e as TouchEvent).touches[0] ?? (e as TouchEvent).changedTouches[0];
        // The same handler the right-click path uses (@contextmenu binding);
        // openContextMenu only reads the pointer position for placement.
        this.openContextMenu({
          clientX: touch?.clientX ?? 0,
          clientY: touch?.clientY ?? 0,
          preventDefault: noop,
          stopPropagation: noop,
        } as MouseEvent, msgId,);

        log.debug("gesture: context menu requested", { messageId: msgId, },);
      },
    },),);

    this._touchGesturesCleanups = cleanups;
  },

  /**
   * Detach every gesture listener registered by setupTouchGestures.
   * @returns {void}
   */
  teardownTouchGestures() {
    for (const cleanup of this._touchGesturesCleanups) { cleanup(); }
    this._touchGesturesCleanups = [];
    this._touchGesturesEl = null;
    this._touchSwipeTarget = null;
    this._touchOnControl = false;
  },
};
