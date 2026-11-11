// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared free-text resolution for VN custom answers.
 *
 * Both custom entry points — a typed question answer and a typed branching
 * choice — validate through here so they enforce ONE contract: a non-empty
 * string, at most VN_FREE_TEXT_MAX_LENGTH characters after trimming, with
 * control characters stripped. The resolved text is stored verbatim;
 * rendering escapes via `textContent`, so no HTML escaping happens at this
 * layer (mirrors `rpg/questions/validation.ts#resolveFreeText`).
 */
import { uid, } from "../../utils";
import type { VnQuestionOption, } from "./vn-questions-types";

/** Maximum length of a typed VN answer or action, matching RPG free_text. */
export const VN_FREE_TEXT_MAX_LENGTH = 2000;

/** Prefix for ids minted for player-typed (custom) VN options and choices. */
export const CUSTOM_VN_ID_PREFIX = "custom-";

/** Accepted result of {@link resolveVnFreeText}. */
export interface ResolvedVnFreeText {
  ok: true;
  /** Trimmed, control-character-free text within the length cap. */
  text: string;
}

/** Rejected result of {@link resolveVnFreeText}. */
export interface RejectedVnFreeText {
  ok: false;
  /** Human-readable reason, surfaced as the 400 response message. */
  message: string;
}

/** Result of resolving client-typed free text. */
export type VnFreeTextResult = ResolvedVnFreeText | RejectedVnFreeText;

/**
 * Validate typed free text for a VN question answer or branching choice.
 * @param raw - the client-supplied value; must be a string.
 * @returns the resolved text, or the rejection reason.
 */
export function resolveVnFreeText(raw: unknown,): VnFreeTextResult {
  if (typeof raw !== "string") {
    return { ok: false, message: "freeText must be a string", };
  }

  // Strip C0 control characters (keeping tab/newline/carriage return) and
  // DEL so a typed answer cannot smuggle control bytes into stored rows.
  // eslint-disable-next-line no-control-regex
  const stripped = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "",);
  const text = stripped.trim();

  if (!text) {
    return { ok: false, message: "freeText must not be empty", };
  }

  if (text.length > VN_FREE_TEXT_MAX_LENGTH) {
    return {
      ok: false,
      message: `freeText must be at most ${VN_FREE_TEXT_MAX_LENGTH} characters`,
    };
  }

  return { ok: true, text, };
}

/**
 * Mint the id for a player-typed (custom) VN option or choice row. The
 * `custom-` prefix is the fast provenance marker alongside the stored
 * `provenance: "custom"` flag.
 * @returns a fresh `custom-<uuid>` id.
 */
export function newCustomVnId(): string {
  return `${CUSTOM_VN_ID_PREFIX}${uid()}`;
}

/** Accepted resolution: the option an answer lands on. */
export interface VnAnswerOptionResolution {
  ok: true;
  /** The picked option, or the synthesized custom one for typed answers. */
  option: VnQuestionOption;
  /**
   * Present only for typed answers: append to the question's options and
   * persist it with the answer flip so the typed text stays on the row.
   */
  customOption: VnQuestionOption | null;
}

/** Failed resolution: the exact 400 message to surface. */
export interface VnAnswerOptionRejection {
  ok: false;
  message: string;
}

/** Result of resolving an answer's option channel. */
export type VnAnswerOptionResult = VnAnswerOptionResolution | VnAnswerOptionRejection;

/**
 * Resolve which option a question answer lands on.
 *
 * Exactly one channel must be present: an authored `optionId` that exists on
 * the question, or typed `freeText` that passes {@link resolveVnFreeText}.
 * A typed answer becomes a first-class option — synthesized with zero
 * modifiers and `provenance: "custom"` — so stored rows, API responses and
 * generation prompts distinguish picked-vs-typed through the same shape.
 * @param options - the question's parsed options.
 * @param optionId - the picked option id, when the player picked one.
 * @param freeText - the typed answer, when the player typed one.
 * @returns the resolved option, or the rejection reason.
 */
export function resolveVnAnswerOption(
  options: VnQuestionOption[],
  optionId: unknown,
  freeText: unknown,
): VnAnswerOptionResult {
  const hasOption = typeof optionId === "string" && optionId !== "";
  const hasFreeText = freeText !== undefined && freeText !== null;
  if (hasOption === hasFreeText) {
    return { ok: false, message: "Provide exactly one of optionId or freeText", };
  }

  if (hasFreeText) {
    const resolved = resolveVnFreeText(freeText,);
    if (!resolved.ok) {
      return resolved;
    }

    const customOption: VnQuestionOption = {
      id: newCustomVnId(),
      text: resolved.text,
      emotion_modifier: 0,
      relationship_modifier: 0,
      next_scene_id: null,
      consequence: null,
      provenance: "custom",
    };

    return { ok: true, option: customOption, customOption, };
  }

  const option = options.find((o,) => o.id === optionId);
  if (!option) {
    return { ok: false, message: "Option not found on question", };
  }

  return { ok: true, option, customOption: null, };
}
