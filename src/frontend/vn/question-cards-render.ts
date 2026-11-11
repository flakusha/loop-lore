// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Question card DOM rendering. Mirrors ./choice-cards-render.ts. */
import { t, } from "../alpine/i18n";
import { buildFreeformInput, } from "./freeform-input";
import type { VnQuestion, VnQuestionOption, } from "./question-cards";

// ── Internal ────────────────────────────────────────────────────────────────

/** "+12" / "−12" / "" for a signed impact value.
 * @param value - the signed impact number.
 */
function impactLabel(value: number,): string {
  if (!Number.isFinite(value,) || value === 0) { return ""; }
  return value > 0 ? `+${value}` : String(value,);
}

/**
 * Render every available question into the container.
 *
 * Options are native `<button>` elements so keyboard tab/enter selection and
 * focus order come from the platform rather than a hand-rolled key handler.
 * @param container
 * @param questions
 * @param onAnswer
 * @param onSkip - called with every available question id when the skip button is clicked.
 * @param onFreeTextAnswer - called with the question id and the typed answer when a card's free-text form is submitted.
 * @returns {void}
 */
export function renderQuestionCards(
  container: HTMLElement,
  questions: VnQuestion[],
  onAnswer: (questionId: string, optionId: string,) => void,
  onSkip?: (questionId: string,) => void,
  onFreeTextAnswer?: (questionId: string, text: string,) => void,
): void {
  if (!container) {
    return;
  }

  container.replaceChildren();

  const list = document.createElement("div",);
  list.className = "vn-question-list";

  const renderOption = (question: VnQuestion, option: VnQuestionOption,): HTMLButtonElement => {
    const btn = document.createElement("button",);
    btn.className = "vn-question-option";
    btn.type = "button";
    btn.dataset.questionId = question.id;
    btn.dataset.optionId = option.id;

    // An answered question is closed: the record stays visible, but its
    // options are no longer actionable.
    const answered = question.status === "answered";
    if (answered) {
      btn.disabled = true;
      btn.className = "vn-question-option vn-question-option-answered";
    }

    const label = document.createElement("span",);
    label.className = "vn-question-option-label";
    label.textContent = option.text;
    btn.append(label,);

    // Impact preview: surfaced as text so it is readable by assistive tech
    // and testable without a tooltip implementation.
    const impact = impactLabel(option.relationship_modifier,);
    if (impact) {
      const hint = document.createElement("span",);
      hint.className = "vn-question-option-impact";
      hint.textContent = impact;
      btn.append(hint,);
    }

    btn.addEventListener("click", () => {
      void onAnswer(question.id, option.id,);
    },);

    return btn;
  };

  for (const question of questions) {
    const card = document.createElement("div",);
    // A question persisted with zero options is free-text-first: typing is
    // the only way to respond, so the card leads with the input instead of
    // rendering a dead card the player can never answer.
    card.className = question.status === "available" && (question.options ?? []).length === 0
      ? "vn-question-card vn-question-card-freeform"
      : "vn-question-card";

    card.dataset.questionId = question.id;

    if (question.speaker_id) {
      const speaker = document.createElement("div",);
      speaker.className = "vn-question-card-speaker";
      speaker.textContent = question.speaker_id;
      card.append(speaker,);
    }

    const text = document.createElement("div",);
    text.className = "vn-question-card-text";
    text.textContent = question.question_text;
    card.append(text,);

    const options = document.createElement("div",);
    options.className = "vn-question-card-options";
    // Guarded: a question persisted with an empty options array renders as a
    // free-text-first card rather than a zero-button card the player can
    // never answer.
    for (const option of question.options ?? []) {
      options.append(renderOption(question, option,),);
    }

    // The custom-typeable affordance: every open question can also be
    // answered by typing, whatever its authored options say.
    if (question.status === "available" && onFreeTextAnswer) {
      options.append(buildFreeformInput({
        className: "vn-question-freeform",
        placeholder: t("toasts.vnCustomAnswerPlaceholder",),
        sendLabel: t("toasts.vnCustomAnswerSend",),
        onSubmit: (text,) => {
          onFreeTextAnswer(question.id, text,);
        },
      },),);
    }

    // Skip control, shown only while the question is still open.
    if (question.status === "available" && onSkip) {
      const skip = document.createElement("button",);
      skip.className = "vn-question-skip";
      skip.type = "button";
      skip.dataset.questionId = question.id;
      skip.textContent = t("toasts.vnSkipQuestion",);
      skip.addEventListener("click", () => {
        void onSkip(question.id,);
      },);

      card.append(skip,);
    }

    card.append(options,);
    list.append(card,);
  }

  container.append(list,);
}
