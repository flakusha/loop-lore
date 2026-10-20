// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/frontend/vn/scene-renderer/dom-elements.ts — the DOM CONSTRUCTION
 * helpers for a rendered VN scene: background, portrait, dialogue box,
 * navigation bar and attachment grid.
 *
 * Split out of ./render-scene.ts, which keeps the render orchestration
 * (template overrides, the run token, mount/transition, typewriter). Every
 * helper here is a pure builder: it takes a scene plus the already-resolved
 * settings and returns an element, touching no renderer state.
 */
import {
  createPortraitElement,
  getPortraitPosition,
  getPortraitUrl,
} from "../portrait-manager";
import { state, } from "./state";

/** Navigation callbacks injected by the controller to break the module cycle. */
export interface SceneNavigator {
  next: () => void;
  prev: () => void;
}

// ── DOM construction helpers --------------------------------

/**
 * Sanitize a URL for use inside a quoted CSS url() token.
 *
 * Rejects control characters and the url()-token terminator `)` outright; any
 * other value is percent-encoded, which also removes `"` and whitespace so the
 * value cannot be reinterpreted as another CSS token.
 *
 * @param url
 * @returns the encoded url() argument, or an empty string when unsafe
 */
function sanitizeCssUrl(url: string,): string {
  return /[\p{Cc})]/u.test(url,) ? "" : encodeURIComponent(url,);
}

/**
 * @param scene
 * @param scene.backgroundUrl
 * @param settings
 * @param settings.imageScaling
 */
export function createBackground(scene: { backgroundUrl?: string }, settings: { imageScaling: string },): HTMLElement {
  const bg = document.createElement("div",);
  bg.className = "vn-background";
  bg.style.backgroundImage = `url("${sanitizeCssUrl(scene.backgroundUrl ?? "",)}")`;
  bg.style.backgroundSize = settings.imageScaling === "auto" ? "cover" : settings.imageScaling;
  return bg;
}

/**
 * @param scene
 * @param scene.role
 * @param scene.characterName
 * @param scene.characterAvatar
 * @param settings
 * @param settings.layout
 * @param settings.portraitSize
 */
export function createPortrait(
  scene: { role: string; characterName: string; characterAvatar?: string },
  settings: { layout: string; portraitSize: number },
): HTMLElement | null {
  if (settings.layout === "overlay") { return null; }
  const portraitPos = getPortraitPosition(scene.role as "narration" | "user" | "assistant" | "system",);
  if (portraitPos === "none") { return null; }
  return createPortraitElement({
    name: scene.characterName,
    avatarUrl: getPortraitUrl(scene.characterAvatar,),
    position: portraitPos,
    sizePercent: settings.portraitSize,
  },);
}

/**
 * @param scene
 * @param scene.role
 * @param scene.characterName
 * @param scene.thinking
 * @param settings
 * @param settings.layout
 * @param settings.dialogueBoxOpacity
 * @param textEl
 */
export function createDialogue(
  scene: { role: string; characterName: string; thinking?: string },
  settings: { layout: string; dialogueBoxOpacity: number },
  textEl: HTMLElement,
): HTMLElement {
  const box = document.createElement("div",);
  box.className = "vn-dialogue-box";
  if (settings.layout === "overlay") { box.style.opacity = String(settings.dialogueBoxOpacity,); }

  const speaker = document.createElement("div",);
  speaker.className = "vn-speaker";
  speaker.textContent = scene.role === "narration" ? "Narrator" : scene.characterName;
  box.append(speaker,);

  if (scene.thinking) {
    const details = document.createElement("details",);
    details.className = "vn-thinking";
    const summary = document.createElement("summary",);
    summary.textContent = "Thinking...";
    details.append(summary,);
    const content = document.createElement("div",);
    content.textContent = scene.thinking;
    details.append(content,);
    box.append(details,);
  }

  box.append(textEl,);

  const advance = document.createElement("div",);
  advance.className = "vn-advance";
  advance.textContent = "▼";
  box.append(advance,);

  return box;
}

/**
 * @param navigate
 */
export function createNav(navigate: SceneNavigator,): HTMLElement {
  const nav = document.createElement("div",);
  nav.className = "vn-nav";

  const prevBtn = document.createElement("button",);
  prevBtn.className = "vn-nav-btn vn-prev";
  prevBtn.textContent = "←";
  prevBtn.disabled = state.currentIndex === 0;
  prevBtn.addEventListener("click", navigate.prev,);

  const nextBtn = document.createElement("button",);
  nextBtn.className = "vn-nav-btn vn-next";
  nextBtn.textContent = "→";
  nextBtn.disabled = state.currentIndex === state.scenes.length - 1;
  nextBtn.addEventListener("click", navigate.next,);

  const counter = document.createElement("span",);
  counter.className = "vn-counter";
  counter.textContent = `${state.currentIndex + 1} / ${state.scenes.length}`;

  nav.append(prevBtn, counter, nextBtn,);
  return nav;
}

/**
 * @param scene
 * @param scene.attachments
 */
export function createAttachments(
  scene: { attachments?: Array<{ assetId: string; thumbUrl?: string; caption?: string; filename?: string }> },
): HTMLElement | null {
  if (!scene.attachments?.length) { return null; }
  const el = document.createElement("div",);
  el.className = "vn-attachments";
  const title = document.createElement("div",);
  title.className = "vn-attachments-title";
  title.textContent = "Attachments";
  el.append(title,);
  const grid = document.createElement("div",);
  grid.className = "vn-attachments-grid";
  for (const a of scene.attachments) {
    const item = document.createElement("div",);
    item.className = "vn-attachment-item";
    const thumb = document.createElement("img",);
    thumb.src = a.thumbUrl ?? `/api/v1/assets/${encodeURIComponent(a.assetId,)}/thumb`;
    thumb.alt = a.caption || a.filename || "Attachment";
    thumb.loading = "lazy";
    thumb.className = "vn-attachment-thumb";
    item.append(thumb,);
    const label = a.caption || a.filename;
    if (label) {
      const cap = document.createElement("div",);
      cap.className = "vn-attachment-caption";
      cap.textContent = label;
      item.append(cap,);
    }

    grid.append(item,);
  }

  el.append(grid,);
  return el;
}
