// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Info bubble — reusable help tooltip (TASK-info-bubbles).
 *
 * Host usage (mirrors the text-toolbar include pattern — `{{> }}` includes
 * take no params, so the host owns the x-data scope and its help key):
 *
 *   <span x-data="infoBubble({ helpKey: 'help.settings.theme' })">{{> info-bubble.html }}</span>
 *
 * Behaviour mirrors the emoji-reactions popover contract: the template
 * dismisses on Escape / click-away (declarative `@keydown.escape.window` /
 * `@click.outside`, same as the reaction picker in message-list.html), and
 * animation is gated on `prefersReducedMotion()` from effects/text-fx.
 */

import { prefersReducedMotion, } from "../effects/text-fx";
import { t, } from "./i18n";

export type InfoBubblePlacement = "top" | "right" | "bottom" | "left";
export type InfoBubbleMode = "hover" | "click" | "auto";

export interface InfoBubbleOptions {
  helpKey?: string;
  placement?: InfoBubblePlacement;
  mode?: InfoBubbleMode;
}

const PLACEMENTS: readonly InfoBubblePlacement[] = ["top", "right", "bottom", "left",];

/**
 * Coerce an unknown placement to a known one; anything else falls back to "top".
 * @param value
 */
export function normalizePlacement(value: unknown,): InfoBubblePlacement {
  return (PLACEMENTS as readonly string[]).includes(value as string,)
    ? (value as InfoBubblePlacement)
    : "top";
}

/**
 * Hover opens the popover in `hover` mode, or in `auto` mode on fine pointers
 * (touch/keyboard users get click + focus instead).
 * @param mode
 * @param hoverCapable - matchMedia("(hover: hover) and (pointer: fine)")
 */
export function shouldHover(mode: InfoBubbleMode, hoverCapable: boolean,): boolean {
  return mode === "hover" || (mode === "auto" && hoverCapable);
}

/** Fine-pointer detection; false without matchMedia (SSR/tests). */
function isHoverCapable(): boolean {
  try {
    return globalThis.matchMedia?.("(hover: hover) and (pointer: fine)",)?.matches ?? false;
  } catch {
    return false;
  }
}

let nextBubbleId = 0;

export interface InfoBubbleState {
  helpKey: string;
  placement: InfoBubblePlacement;
  mode: InfoBubbleMode;
  open: boolean;
  bubbleId: string;
  animate: boolean;
  init(): void;
  text(): string;
  label(): string;
  popoverClass(): string;
  show(): void;
  hide(): void;
  toggle(): void;
  onEnter(): void;
  onLeave(): void;
  onFocus(): void;
  onBlur(): void;
}

/**
 * Alpine entry point (`x-data="infoBubble({ helpKey })"`).
 * @param opts
 */
export function infoBubble(opts: InfoBubbleOptions = {},): InfoBubbleState {
  return {
    helpKey: opts.helpKey ?? "",
    placement: normalizePlacement(opts.placement,),
    mode: opts.mode ?? "auto",
    open: false,
    bubbleId: "",
    animate: true,

    /** Alpine auto-calls init: unique tooltip id + reduced-motion gate. */
    init() {
      nextBubbleId += 1;
      this.bubbleId = `info-bubble-${nextBubbleId}`;
      this.animate = !prefersReducedMotion();
    },

    /** Help text via the client-side t(); missing key renders the key itself. */
    text() {
      return this.helpKey ? t(this.helpKey,) : "";
    },

    /** Accessible name for the (?) trigger. */
    label() {
      return t("accessibility.help",);
    },

    popoverClass() {
      return `info-bubble-${this.placement}`;
    },

    show() {
      this.open = true;
    },

    hide() {
      this.open = false;
    },

    toggle() {
      this.open = !this.open;
    },

    onEnter() {
      if (shouldHover(this.mode, isHoverCapable(),)) { this.open = true; }
    },

    onLeave() {
      if (shouldHover(this.mode, isHoverCapable(),)) { this.open = false; }
    },

    onFocus() {
      this.open = true;
    },

    onBlur() {
      this.open = false;
    },
  };
}

globalThis.infoBubble = infoBubble;
