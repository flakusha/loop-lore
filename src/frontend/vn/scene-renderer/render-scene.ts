import {
  createPortraitElement,
  getPortraitPosition,
  getPortraitUrl,
} from "../portrait-manager";
import { transitionScene, } from "../transition-engine";
import { isTypewriting, skipTypewrite, typewrite, } from "../typewriter";
import { state, } from "./state";

/** Navigation callbacks injected by the controller to break the module cycle. */
export interface SceneNavigator {
  next: () => void;
  prev: () => void;
}

// ── DOM construction helpers ────────────────────────────────

function createBackground(scene: { backgroundUrl?: string }, settings: { imageScaling: string },): HTMLElement {
  const bg = document.createElement("div",);
  bg.className = "vn-background";
  bg.style.backgroundImage = `url(${scene.backgroundUrl})`;
  bg.style.backgroundSize = settings.imageScaling === "auto" ? "cover" : settings.imageScaling;
  return bg;
}

function createPortrait(
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

function createDialogue(
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

function createNav(navigate: SceneNavigator,): HTMLElement {
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

function createAttachments(
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
    thumb.src = a.thumbUrl ?? `/api/assets/${a.assetId}/thumb`;
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

export async function renderCurrentScene(
  animate = false,
  navigate: SceneNavigator,
): Promise<void> {
  const container = state.container;
  const settings = state.settings;
  if (!container || !settings) { return; }

  const scene = state.scenes[state.currentIndex]!;
  const prevIndex = animate ? state.currentIndex - 1 : -1;
  const outgoing = animate && prevIndex >= 0 ? container.querySelector<HTMLElement>(".vn-scene",) : null;

  const sceneEl = document.createElement("div",);
  sceneEl.className = `vn-scene vn-layout-${settings.layout}`;

  if (scene.backgroundUrl) { sceneEl.append(createBackground(scene, settings,),); }
  const portraitEl = createPortrait(scene, settings,);
  if (portraitEl) { sceneEl.append(portraitEl,); }

  const textEl = document.createElement("div",);
  textEl.className = "vn-text";
  sceneEl.append(createDialogue(scene, settings, textEl,),);
  sceneEl.append(createNav(navigate,),);

  if (state.currentChatId) {
    const choicesEl = document.createElement("div",);
    choicesEl.className = "vn-choices-container";
    sceneEl.append(choicesEl,);
  }
  const attachmentsEl = createAttachments(scene,);
  if (attachmentsEl) { sceneEl.append(attachmentsEl,); }

  sceneEl.addEventListener("click", () => {
    if (isTypewriting()) { skipTypewrite(textEl, scene.text,); }
    else { navigate.next(); }
  },);

  if (animate && outgoing) {
    const transitionType = scene.transition ?? settings.transition;
    await transitionScene(outgoing, sceneEl, { type: transitionType, },);
  } else {
    container.replaceChildren();
    container.append(sceneEl,);
  }

  if (settings.typewriter) {
    await typewrite(textEl, scene.text, { speed: settings.typewriterSpeed, pausePunctuation: true, },);
  } else {
    textEl.textContent = scene.text;
  }
}
