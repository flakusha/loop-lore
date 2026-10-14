// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Text-Effect Overlays (TASK-text-effects-overlays, Phases 2-3)
 *
 * Pure helpers that render status-bar + badge overlays on the shipped
 * text-fx core (`text-fx.ts`: shake / glow / typewriter / fade). CSS owns
 * every visual (the fx-overlay-* classes live next to the fx-* classes in
 * src/public/css/app.css); this module owns the emotion to effect mapping,
 * the keyword to condition-icon detection, and the HTML string builders.
 * Builders escape interpolated text and return "" when there is nothing to
 * show, so Alpine templates can `x-html` them unconditionally. Nothing
 * animates here, so reduced-motion holds by construction (the effects
 * themselves defer to the core's reduced-motion handling plus the
 * `prefers-reduced-motion` media query in app.css). Each overlay targets
 * its own slot (status above, icons after text, location at section
 * boundaries, time bottom-right), so there is no composed blob — templates
 * call one builder per slot.
 */

import { escapeHtml, } from "../html-escape";
import { applyFx, type FxName, } from "./text-fx";

/**
 * Emotion to text-fx mapping (Emotion to Effect table in
 * docs/frontend/chat/text-effects-overlays.md). Only emotions with a
 * shipped core equivalent are mapped — surprised (pulse), fearful (wave),
 * and magic (rainbow) have no text-fx class yet. Keys are the canonical
 * EmotionType values the emotion hook persists on `messages.emotion`
 * (already lowercase); lookup lowercases defensively.
 */
const EMOTION_FX: Record<string, FxName> = {
  angry: "shake",
  happy: "glow",
  sad: "fade",
};

/**
 * Shipped text-fx effect for a detected emotion, or null when the message
 * has no emotion or no core equivalent (fallback: no effect). One emotion
 * maps to one effect, so the max-effects-per-message cap holds inherently.
 * @param emotion
 * @returns {FxName | null}
 */
export function emotionFx(emotion?: string | null,): FxName | null {
  if (!emotion) { return null; }
  return EMOTION_FX[emotion.toLowerCase()] ?? null;
}

/**
 * CSS class for a detected emotion ("" = none). Every message render calls
 * this, so the mapping lives here rather than inline in the template.
 * @param emotion
 * @returns {string}
 */
export function emotionFxClass(emotion?: string | null,): string {
  const fx = emotionFx(emotion,);
  return fx ? `fx-${fx}` : "";
}

/**
 * Imperatively apply the emotion effect to an element. Returns stop().
 * Unknown emotions are a no-op; reduced-motion defers to applyFx/CSS.
 * @param el
 * @param emotion
 * @returns {() => void}
 */
export function applyEmotionFx(el: HTMLElement, emotion?: string | null,): () => void {
  const fx = emotionFx(emotion,);
  if (!fx) { return () => {/* no-op */}; }
  return applyFx(el, fx,);
}

/** Keyword to condition icon (spec icon table). Order = display priority. */
const CONDITION_ICONS: { icon: string; label: string; keywords: string[] }[] = [
  { icon: "\uD83D\uDDE1️", label: "Combat", keywords: ["combat", "battle", "fight", "attack", "sword",], },
  { icon: "\uD83D\uDC80", label: "Danger", keywords: ["danger", "death", "dying", "kill", "dead",], },
  { icon: "✨", label: "Magic", keywords: ["magic", "spell", "enchant", "arcane", "supernatural",], },
  { icon: "\uD83C\uDF19", label: "Night", keywords: ["night", "dark", "moonlit", "midnight",], },
  { icon: "\uD83D\uDD25", label: "Fire", keywords: ["fire", "burn", "flame", "inferno",], },
  { icon: "\uD83D\uDC95", label: "Romance", keywords: ["love", "kiss", "romance", "affection",], },
  { icon: "⚠️", label: "Warning", keywords: ["warning", "careful", "beware", "tension",], },
  { icon: "\uD83C\uDFB5", label: "Music", keywords: ["music", "song", "melody", "singing",], },
];

/** Max condition icons per message (spec cap). */
export const MAX_CONDITION_ICONS = 3;

/**
 * Auto-detect condition icons from message content (keyword-based, per
 * spec). Most relevant first, capped at MAX_CONDITION_ICONS.
 * @param content
 * @returns {{{ icon: string; label: string }[]}}
 */
export function detectConditionIcons(content: string,): { icon: string; label: string }[] {
  const lower = content.toLowerCase();
  const out: { icon: string; label: string }[] = [];
  for (const entry of CONDITION_ICONS) {
    if (out.length >= MAX_CONDITION_ICONS) { break; }
    if (entry.keywords.some((k,) => lower.includes(k,))) {
      out.push({ icon: entry.icon, label: entry.label, },);
    }
  }

  return out;
}

/**
 * Condition-icons overlay HTML ("" when nothing detected). Icons carry
 * text fallbacks via title; the container has an aria-label.
 * @param content
 * @returns {string}
 */
export function conditionIconsHtml(content: string,): string {
  const icons = detectConditionIcons(content,);
  if (icons.length === 0) { return ""; }
  const label = icons.map((i,) => i.label).join(", ",);
  const spans = icons
    .map((i,) => `<span class="fx-condition-icon" title="${i.label}">${i.icon}</span>`)
    .join("",);

  return `<span class="fx-condition-icons" role="img" aria-label="Message context: ${
    escapeHtml(label,)
  }">${spans}</span>`;
}

/** Stats shape for the status bar (subset of chat-state RpgStats). */
export interface OverlayStats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
}

/**
 * Status-bar overlay HTML above a character message ("" when stats is
 * null — i.e. RPG mechanics inactive for the chat). HP bar mirrors the
 * battle-panel progressbar pattern (role + aria values).
 * @param stats
 * @param conditions
 * @returns {string}
 */
export function statusBarHtml(stats: OverlayStats | null | undefined, conditions: string[] = [],): string {
  if (!stats) { return ""; }
  const hp = nonNegInt(stats.hp,);
  const maxHp = nonNegInt(stats.maxHp,);
  const mp = nonNegInt(stats.mp,);
  const maxMp = nonNegInt(stats.maxMp,);
  const hpPct = maxHp > 0 ? Math.round((Math.min(hp, maxHp,) / maxHp) * 100,) : 0;
  const conds = conditions.filter((c,) => c.trim().length > 0).map((c,) => escapeHtml(c.trim(),));
  const label = `HP ${hp} of ${maxHp}, MP ${mp} of ${maxMp}${conds.length > 0 ? `, ${conds.join(", ",)}` : ""}`;
  const condHtml = conds.map((c,) => ` <span class="fx-status-cond">${c}</span>`).join("",);
  return `<div class="fx-status-bar" role="status" aria-label="${label}">` +
    `<span class="fx-status-hp" title="HP">❤️ ${hp}/${maxHp}</span>` +
    `<span class="fx-status-hpbar" role="progressbar" aria-valuemin="0" aria-valuemax="100"` +
    ` aria-valuenow="${hpPct}" aria-label="HP"><span style="width:${hpPct}%"></span></span>` +
    `<span class="fx-status-mp" title="MP">🔷 ${mp}/${maxMp}</span>${condHtml}</div>`;
}

/**
 * Location-badge HTML for section boundaries ("" when no label). A span,
 * not a button: no location-info panel exists to open, so there is no
 * click target to wire — full context stays in title/aria-label.
 * @param label
 * @returns {string}
 */
export function locationBadgeHtml(label: string | null | undefined,): string {
  if (!label) { return ""; }
  const text = escapeHtml(label,);
  return `<span class="fx-location-badge" title="${text}" aria-label="Location: ${text}">📍 ${text}</span>`;
}

/**
 * Time-badge HTML ("" when no label). Pass the already-formatted stamp
 * (chat-state formatTime / world time); optional dateTime for machine
 * readability. Renders as <time> for semantics.
 * @param label
 * @param dateTime
 * @returns {string}
 */
export function timeBadgeHtml(label: string | null | undefined, dateTime?: string,): string {
  if (!label) { return ""; }
  const dt = dateTime ? ` datetime="${escapeHtml(dateTime,)}"` : "";
  return `<time class="fx-time-badge"${dt}>${escapeHtml(label,)}</time>`;
}

/**
 * Non-negative finite int; NaN/garbage renders as 0. Shared by all four
 * stat slots so HP/MP/MP-max clamp in lockstep.
 * @param v
 * @returns {number}
 */
function nonNegInt(v: number,): number {
  return Number.isFinite(v,) ? Math.max(0, Math.floor(v,),) : 0;
}
