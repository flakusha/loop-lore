import { initChoiceCards, loadChoices, } from "../choice-cards";
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
  prevBtn.disabled = state.currentIndex === 0;
  prevBtn.addEventListener("click", navigate.prev,);
  const nextBtn = document.createElement("button",);
  nextBtn.className = "vn-nav-btn vn-next";
  nextBtn.textContent = "→";
  nextBtn.disabled = state.currentIndex === state.scenes.length - 1;
  nextBtn.addEventListener("click", navigate.next,);
  const counterEl = document.createElement("span",);
  counterEl.className = "vn-counter";
  counterEl.textContent = `${state.currentIndex + 1} / ${state.scenes.length}`;
  navEl.append(prevBtn,);
  navEl.append(counterEl,);
  navEl.append(nextBtn,);
  sceneEl.append(navEl,);

  // Choice cards container
  if (state.currentChatId) {
    const choicesEl = document.createElement("div",);
    choicesEl.className = "vn-choices-container";
    sceneEl.append(choicesEl,);
    initChoiceCards(choicesEl, state.currentChatId, state.currentIndex,);
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
      navigate.next();
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
