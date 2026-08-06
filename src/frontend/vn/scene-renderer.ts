/**
 * VN Scene Renderer
 *
 * Main scene manager for Visual Novel mode.
 * Maps messages to scenes, manages navigation, orchestrates transitions.
 */

import type { MessageAttachment, } from "../alpine/chat-types";
import { destroyChoiceCards, initChoiceCards, loadChoices, } from "./choice-cards";
import {
  createLoadingIndicator,
  type LoadingIndicator,
  preloadSceneImages,
  type SceneImages,
} from "./image-preloader";
import {
  createPortraitElement,
  getPortraitPosition,
  getPortraitUrl,
} from "./portrait-manager";
import type { VnSettings, } from "./settings";
import { getVnSettings, } from "./settings";
import { transitionScene, type TransitionType, } from "./transition-engine";
import { isTypewriting, skipTypewrite, typewrite, } from "./typewriter";

/** A single VN scene derived from one or more messages. */
export interface VnScene {
  messageId: string;
  backgroundUrl?: string;
  characterName: string;
  characterAvatar?: string;
  text: string;
  thinking?: string;
  role: "assistant" | "user" | "system" | "narration";
  transition?: TransitionType;
  attachments?: MessageAttachment[];
}

/** Message shape expected by the renderer. */
export interface VnMessage {
  id: string;
  role: "assistant" | "user" | "system" | "narration";
  name?: string;
  content: string;
  thinking?: string;
  avatar_asset_id?: string;
  background_url?: string;
  attachments?: MessageAttachment[];
}

let scenes: VnScene[] = [];
let currentIndex = 0;
let container: HTMLElement | null = null;
let settings: VnSettings | null = null;
let currentChatId: string | null = null;
let loadingIndicator: LoadingIndicator | null = null;
let locationChangeHandler: ((e: Event,) => void) | null = null;

/**
 * Initialize the VN scene renderer.
 */
export function initVnRenderer(
  containerEl: HTMLElement,
  messages: VnMessage[],
  gmConfig?: Record<string, unknown>,
  chatId?: string,
): void {
  container = containerEl;
  settings = getVnSettings(gmConfig,);
  scenes = messages.map((msg,) => msgToScene(msg,));
  currentIndex = Math.max(0, scenes.length - 1,);
  currentChatId = chatId ?? null;
  loadingIndicator = createLoadingIndicator(containerEl,);

  // React to chat location changes (frontend-driven) with a short travel
  // transition. Safe by design: this consumes a frontend DOM event and never
  // touches location access-check logic.
  if (locationChangeHandler) {
    globalThis.removeEventListener("chat:location-changed", locationChangeHandler,);
  }
  locationChangeHandler = handleLocationChanged;
  globalThis.addEventListener("chat:location-changed", locationChangeHandler,);

  // Preload images for current and upcoming scenes
  void preloadCurrentAndUpcoming();

  renderCurrentScene();
}

/**
 * Destroy the VN renderer, cleaning up DOM.
 */
export function destroyVnRenderer(): void {
  if (locationChangeHandler) {
    globalThis.removeEventListener("chat:location-changed", locationChangeHandler,);
    locationChangeHandler = null;
  }
  destroyChoiceCards();
  loadingIndicator = null;
  if (container) {
    container.replaceChildren();
    container = null;
  }
  scenes = [];
  currentIndex = 0;
  settings = null;
  currentChatId = null;
}

/**
 * Navigate to the next scene.
 */
export function nextScene(): void {
  if (currentIndex >= scenes.length - 1) {
    return;
  }

  currentIndex++;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true,);
}

/**
 * Navigate to the previous scene.
 */
export function prevScene(): void {
  if (currentIndex <= 0) {
    return;
  }

  currentIndex--;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true,);
}

/**
 * Jump to a specific scene index.
 */
export function jumpToScene(index: number,): void {
  if (!(index >= 0 && index < scenes.length)) {
    return;
  }

  currentIndex = index;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true,);
}

/**
 * Get current scene index.
 */
export function getCurrentSceneIndex(): number {
  return currentIndex;
}

/**
 * Get total scene count.
 */
export function getSceneCount(): number {
  return scenes.length;
}

/**
 * Add a new scene from an incoming message (for live streaming).
 */
export function addScene(message: VnMessage,): void {
  scenes.push(msgToScene(message,),);
  currentIndex = scenes.length - 1;
  void preloadCurrentAndUpcoming();
  renderCurrentScene(true,);
}

// ── Image Preloading ─────────────────────────────────────────

async function preloadCurrentAndUpcoming(): Promise<void> {
  if (!loadingIndicator || scenes.length === 0) { return; }

  loadingIndicator.show();

  const sceneImages = scenes.map((s,): SceneImages => ({
    backgroundUrl: s.backgroundUrl,
    portraitUrl: s.characterAvatar
      ? getPortraitUrl(s.characterAvatar,)
      : undefined,
  }));

  const stats = await preloadSceneImages(sceneImages, currentIndex, 2,);
  loadingIndicator.updateProgress(stats.loaded + stats.cached, stats.total,);

  // Hide after a short delay to show completion
  setTimeout(() => {
    loadingIndicator?.hide();
  }, 500,);
}

function msgToScene(msg: VnMessage,): VnScene {
  return {
    messageId: msg.id,
    backgroundUrl: msg.background_url,
    characterName: msg.name ?? (msg.role === "user" ? "You" : (msg.role === "system" ? "System" : "Character")),
    characterAvatar: msg.avatar_asset_id,
    text: msg.content,
    thinking: msg.thinking,
    role: msg.role,
    attachments: msg.attachments,
  };
}

/**
 * Handle a `chat:location-changed` event: briefly fade the active scene out and
 * back in to signal a location/travel transition. Only acts when the VN
 * renderer is mounted and the event targets the currently-rendered chat.
 */
function handleLocationChanged(e: Event,): void {
  const detail = (e as CustomEvent<{ chatId?: string; locationId?: string; locationName?: string | null }>).detail;
  if (detail?.chatId && currentChatId && detail.chatId !== currentChatId) { return; }
  if (!container || !settings) { return; }
  const sceneEl = container.querySelector<HTMLElement>(".vn-scene",);
  if (!sceneEl) { return; }
  sceneEl.style.transition = "opacity 280ms ease";
  sceneEl.style.opacity = "0";
  globalThis.setTimeout(() => {
    if (!sceneEl.isConnected) {
      return;
    }

    sceneEl.style.opacity = "1";
    globalThis.setTimeout(() => {
      if (sceneEl.isConnected) { sceneEl.style.transition = ""; }
    }, 300,);
  }, 260,);
}

async function renderCurrentScene(animate = false,): Promise<void> {
  if (!container || !settings) { return; }

  const scene = scenes[currentIndex]!;
  const prevIndex = animate ? currentIndex - 1 : -1;
  const outgoing = animate && prevIndex >= 0 ? container.querySelector<HTMLElement>(".vn-scene",) : null;

  // Create new scene element
  const sceneEl = document.createElement("div",);
  sceneEl.className = `vn-scene vn-layout-${settings.layout}`;

  // Background
  if (scene.backgroundUrl) {
    const bg = document.createElement("div",);
    bg.className = "vn-background";
    bg.style.backgroundImage = `url(${scene.backgroundUrl})`;
    bg.style.backgroundSize = settings.imageScaling === "auto" ? "cover" : settings.imageScaling;
    sceneEl.append(bg,);
  }

  // Portrait (for below and split layouts)
  if (settings.layout !== "overlay") {
    const portraitPos = getPortraitPosition(scene.role,);
    if (portraitPos !== "none") {
      const portraitConfig = {
        name: scene.characterName,
        avatarUrl: getPortraitUrl(scene.characterAvatar,),
        position: portraitPos,
        sizePercent: settings.portraitSize,
      };
      const portraitEl = createPortraitElement(portraitConfig,);
      sceneEl.append(portraitEl,);
    }
  }

  // Dialogue box
  const dialogueBox = document.createElement("div",);
  dialogueBox.className = "vn-dialogue-box";
  if (settings.layout === "overlay") {
    dialogueBox.style.opacity = String(settings.dialogueBoxOpacity,);
  }

  // Speaker name
  const speakerEl = document.createElement("div",);
  speakerEl.className = "vn-speaker";
  speakerEl.textContent = scene.role === "narration" ? "Narrator" : scene.characterName;
  dialogueBox.append(speakerEl,);

  // Thinking block (collapsed)
  if (scene.thinking) {
    const thinkingEl = document.createElement("details",);
    thinkingEl.className = "vn-thinking";
    const summary = document.createElement("summary",);
    summary.textContent = "Thinking...";
    thinkingEl.append(summary,);
    const thinkingContent = document.createElement("div",);
    thinkingContent.textContent = scene.thinking;
    thinkingEl.append(thinkingContent,);
    dialogueBox.append(thinkingEl,);
  }

  // Text content with typewriter
  const textEl = document.createElement("div",);
  textEl.className = "vn-text";
  dialogueBox.append(textEl,);

  // Advance indicator
  const advanceEl = document.createElement("div",);
  advanceEl.className = "vn-advance";
  advanceEl.textContent = "▼";
  dialogueBox.append(advanceEl,);

  sceneEl.append(dialogueBox,);

  // Scene navigation
  const navEl = document.createElement("div",);
  navEl.className = "vn-nav";
  const prevBtn = document.createElement("button",);
  prevBtn.className = "vn-nav-btn vn-prev";
  prevBtn.textContent = "←";
  prevBtn.disabled = currentIndex === 0;
  prevBtn.addEventListener("click", prevScene,);
  const nextBtn = document.createElement("button",);
  nextBtn.className = "vn-nav-btn vn-next";
  nextBtn.textContent = "→";
  nextBtn.disabled = currentIndex === scenes.length - 1;
  nextBtn.addEventListener("click", nextScene,);
  const counterEl = document.createElement("span",);
  counterEl.className = "vn-counter";
  counterEl.textContent = `${currentIndex + 1} / ${scenes.length}`;
  navEl.append(prevBtn,);
  navEl.append(counterEl,);
  navEl.append(nextBtn,);
  sceneEl.append(navEl,);

  // Choice cards container
  if (currentChatId) {
    const choicesEl = document.createElement("div",);
    choicesEl.className = "vn-choices-container";
    sceneEl.append(choicesEl,);
    initChoiceCards(choicesEl, currentChatId, currentIndex,);
    loadChoices();
  }

  // Attachments panel
  if (scene.attachments && scene.attachments.length > 0) {
    const attachmentsEl = document.createElement("div",);
    attachmentsEl.className = "vn-attachments";
    const attachmentsTitle = document.createElement("div",);
    attachmentsTitle.className = "vn-attachments-title";
    attachmentsTitle.textContent = "Attachments";
    attachmentsEl.append(attachmentsTitle,);
    const attachmentsGrid = document.createElement("div",);
    attachmentsGrid.className = "vn-attachments-grid";
    for (const attachment of scene.attachments) {
      const itemEl = document.createElement("div",);
      itemEl.className = "vn-attachment-item";
      const thumbEl = document.createElement("img",);
      thumbEl.src = attachment.thumbUrl ?? `/api/assets/${attachment.assetId}/thumb`;
      thumbEl.alt = attachment.caption || attachment.filename || "Attachment";
      thumbEl.loading = "lazy";
      thumbEl.className = "vn-attachment-thumb";
      itemEl.append(thumbEl,);
      const label = attachment.caption || attachment.filename;
      if (label) {
        const captionEl = document.createElement("div",);
        captionEl.className = "vn-attachment-caption";
        captionEl.textContent = label;
        itemEl.append(captionEl,);
      }
      attachmentsGrid.append(itemEl,);
    }
    attachmentsEl.append(attachmentsGrid,);
    sceneEl.append(attachmentsEl,);
  }

  // Click/space to advance or skip typewriter
  sceneEl.addEventListener("click", () => {
    if (isTypewriting()) {
      skipTypewrite(textEl, scene.text,);
    } else {
      nextScene();
    }
  },);

  // Transition
  if (animate && outgoing) {
    const transitionType = scene.transition ?? settings.transition;
    await transitionScene(outgoing, sceneEl, { type: transitionType, },);
  } else {
    container.replaceChildren();
    container.append(sceneEl,);
  }

  // Run typewriter
  if (settings.typewriter) {
    await typewrite(textEl, scene.text, {
      speed: settings.typewriterSpeed,
      pausePunctuation: true,
    },);
  } else {
    textEl.textContent = scene.text;
  }
}
