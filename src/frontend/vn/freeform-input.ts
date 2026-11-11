// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared "type your own" affordance for VN decision cards.
 *
 * Question and choice cards both expose a type-in fallback next to their
 * authored buttons, so a player is never locked into the generated options.
 * The form is native HTML: Enter submits, the send button is a real submit
 * target, and focus order comes from the platform. Values are read via
 * `.value` and rendered by the card modules via `textContent`, so nothing in
 * this module builds HTML strings (innerHTML XSS gate).
 */

/**
 * Client mirror of the backend cap (`VN_FREE_TEXT_MAX_LENGTH` in
 * src/chat/service/vn-free-text.ts); the server re-validates authoritatively.
 */
export const VN_INPUT_MAX_LENGTH = 2000;

/** Options for {@link buildFreeformInput}. */
export interface FreeformInputOptions {
  /** Wrapper class, e.g. `vn-question-freeform`. */
  className: string;
  /** Accessible label + placeholder for the input. */
  placeholder: string;
  /** Visible label for the send button. */
  sendLabel: string;
  /** Called with the trimmed, non-empty value on submit. */
  onSubmit: (text: string,) => void;
}

/**
 * Build the free-text form (input + send) for a VN decision card.
 * @param options - wrapper class, labels, and the submit callback.
 * @returns the wired form element; append it to the card container.
 */
export function buildFreeformInput(
  options: FreeformInputOptions,
): HTMLFormElement {
  const form = document.createElement("form",);
  form.className = options.className;

  const input = document.createElement("input",);
  input.type = "text";
  input.className = "form-input vn-freeform-input";
  input.maxLength = VN_INPUT_MAX_LENGTH;
  input.placeholder = options.placeholder;
  input.setAttribute("aria-label", options.placeholder,);

  const send = document.createElement("button",);
  send.type = "submit";
  send.className = "btn vn-freeform-send";
  send.textContent = options.sendLabel;

  form.append(input, send,);

  form.addEventListener("submit", (event,) => {
    event.preventDefault();

    const value = input.value.trim();
    if (!value) { return; }

    // Clear on accept so a resubmit cannot double-fire the same action; the
    // caller owns any error feedback (the card re-renders on failure).
    input.value = "";
    options.onSubmit(value,);
  },);

  return form;
}
