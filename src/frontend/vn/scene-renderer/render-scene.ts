// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { initChoiceCards, loadChoices, } from "../choice-cards";
import { initQuestionCards, loadQuestions, } from "../question-cards";
import type { VnSettings, } from "../settings";
import { decorateStageAnchors, } from "../sprite-anchor";
import {
  applyResolvedTemplate,
  applyTemplateOverrides,
  resolveAnyTemplate,
  resolveTemplateForScene,
} from "../templates/apply";
import { compositeStepsOf, executeCompositeSteps, } from "../templates/composite";
import type { VnCompositeStep, } from "../templates/template-engine";
import { transitionScene, } from "../transition-engine";
import { isTypewriting, resolveDialoguePacing, skipTypewrite, typewrite, } from "../typewriter";
import {
  createAttachments,
  createBackground,
  createDialogue,
  createNav,
  createPortrait,
  type SceneNavigator,
} from "./dom-elements";
import { createStage, } from "./stage";
import { state, } from "./state";
import type { VnScene, } from "./types";

export type { SceneNavigator, } from "./dom-elements";

/**
 * Remove previously rendered scene elements from the container while
 * preserving sibling overlays such as the loading indicator.
 * @param container
 */
function removeRenderedScenes(container: HTMLElement,): void {
  // `container.children` is LIVE: removing a child shifts every later index down
  // by one, so forward iteration skips adjacent `.vn-scene` siblings. Walking the
  // index backwards removes only indices below the cursor, so no snapshot (and
  // no spread wrapper) is needed.
  for (let i = container.children.length - 1; i >= 0; i--) {
    const child = container.children[i];
    if (child?.classList.contains("vn-scene",)) { child.remove(); }
  }
}

/**
 * Monotonic token for in-flight renders. Composite templates await real
 * delays before mounting, so a newer navigation must be able to cancel an
 * older run's mount (mirrors typewriter's activeAnimation single-flight).
 */
let renderRunToken = 0;

/**
 * Fold a composite template's steps onto the base settings (pre-mount).
 *
 * Runs the step sequence — conditions evaluated against the scene's
 * templateVars, per-step template resolution through all registries, real
 * delays between steps — folding each applied step's whitelisted overrides
 * into the result (later steps win). Skips (false conditions, unknown ids)
 * are non-fatal by design: the remaining steps still run.
 * @param steps Steps of the scene's composite template.
 * @param scene Scene providing templateVars.
 * @param worldId World scope for custom-template lookup.
 * @param baseSettings Settings every step folds onto.
 * @returns The folded settings — `baseSettings` itself when nothing applies.
 */
async function applyCompositeSettings(
  steps: VnCompositeStep[],
  scene: VnScene,
  worldId: string | null,
  baseSettings: VnSettings,
): Promise<VnSettings> {
  const context = scene.templateVars ?? {};
  let settings = baseSettings;
  await executeCompositeSteps({
    steps,
    context,
    apply: (step,) => {
      const template = resolveAnyTemplate(step.templateId, worldId,);
      if (!template) { return false; }
      settings = applyResolvedTemplate(settings, template, { ...context, ...(step.variables ?? {}), },);
      return true;
    },
  },);

  return settings;
}

export async function renderCurrentScene(
  animate = false,
  navigate: SceneNavigator,
): Promise<void> {
  const container = state.container;
  const baseSettings = state.settings;
  if (!container || !baseSettings) { return; }

  const scene = state.scenes[state.currentIndex];
  if (!scene) { return; }

  const runToken = ++renderRunToken;

  // Scene templates override the base settings for this render only. Never
  // mutates state.settings — applyTemplateOverrides returns a copy (or the
  // base object itself on any fallback path).
  //
  // Composite templates are orchestrated instead: their step sequence (with
  // real delays) runs BEFORE the mount, so the previous scene stays mounted
  // during the waits; the run token cancels this run's mount when a newer
  // render supersedes it mid-wait.
  let settings: VnSettings;
  const compositeSteps = compositeStepsOf(resolveTemplateForScene(scene, state.currentWorldId,),);
  if (compositeSteps) {
    settings = await applyCompositeSettings(compositeSteps, scene, state.currentWorldId, baseSettings,);
    if (runToken !== renderRunToken) { return; }
  } else {
    settings = applyTemplateOverrides(baseSettings, scene, state.currentWorldId,);
  }

  const prevIndex = animate ? state.currentIndex - 1 : -1;
  const outgoing = animate && prevIndex >= 0 ? container.querySelector<HTMLElement>(".vn-scene",) : null;

  const sceneEl = document.createElement("div",);
  sceneEl.className = `vn-scene vn-layout-${settings.layout}`;

  if (scene.backgroundUrl) { sceneEl.append(createBackground(scene, settings,),); }
  const stageEl = createStage(scene, settings,);
  if (stageEl) {
    sceneEl.append(stageEl,);
    // Face-anchor pass is best-effort and never rejects: sprites keep CSS
    // defaults when metadata is missing or unreachable.
    void decorateStageAnchors(stageEl,);
  } else {
    const portraitEl = createPortrait(scene, settings,);
    if (portraitEl) { sceneEl.append(portraitEl,); }
  }

  const textEl = document.createElement("div",);
  textEl.className = "vn-text";
  sceneEl.append(createDialogue(scene, settings, textEl,),);
  sceneEl.append(createNav(navigate,),);

  // Gated on the per-chat opt-in, not just the chat id: initChoiceCards and
  // loadQuestions each fire an HTTP GET on every scene render, so mounting and
  // hiding afterwards would still cost two round-trips per scene. Read from the
  // overlaid `settings`, not `baseSettings`, like every other VN field here.
  if (state.currentChatId && settings.vnChoicesEnabled) {
    const choicesEl = document.createElement("div",);
    choicesEl.className = "vn-choices-container";
    sceneEl.append(choicesEl,);
    // Mount + hydrate: these containers were created but never initialized,
    // so choice cards never reached the DOM at runtime.
    initChoiceCards(choicesEl, state.currentChatId, state.currentIndex,);
    void loadChoices();

    const questionsEl = document.createElement("div",);
    questionsEl.className = "vn-questions-container";
    sceneEl.append(questionsEl,);
    initQuestionCards(questionsEl, state.currentChatId, state.currentIndex,);
    void loadQuestions();
  }

  const attachmentsEl = createAttachments(scene,);
  if (attachmentsEl) { sceneEl.append(attachmentsEl,); }

  sceneEl.addEventListener("click", () => {
    if (isTypewriting()) { skipTypewrite(textEl, scene.text,); }
    else { navigate.next(); }
  },);

  if (animate && outgoing) {
    const transitionType = scene.transition ?? settings.transition;
    // Wire the incoming scene into the DOM before the transition so CSS
    // transitions actually run, then drop the outgoing scene once done.
    container.append(sceneEl,);
    await transitionScene(outgoing, sceneEl, { type: transitionType, },);
    outgoing.remove();
  } else {
    removeRenderedScenes(container,);
    container.append(sceneEl,);
  }

  if (settings.typewriter) {
    await typewrite(
      textEl,
      scene.text,
      resolveDialoguePacing({ speed: settings.typewriterSpeed, pausePunctuation: true, }, scene, state.currentWorldId,),
    );
  } else {
    textEl.textContent = scene.text;
  }
}
