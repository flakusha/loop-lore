// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Questions Component (TASK-029)
 *
 * Loads a chat's open questions from `/api/v1/chats/:chatId/questions` and
 * renders them as clickable option buttons, or a text/number input for
 * free_text/numeric questions (see chat/rpg-questions.html).
 * Answering posts to `/api/v1/questions/:id/answer` (`{ optionId }` for choice,
 * `{ value }` for free_text/numeric), then refreshes the list. Failed
 * submissions keep the answer pending so the Retry button can re-send it.
 */

import { apiFetch, } from "./htmx.js";
import { jsonBody, } from "./json.js";
import type {
  ChatState,
  RpgQuestionInputKind,
  RpgQuestionPendingAnswer,
  RpgQuestionView,
} from "./types.js";

/** Coerces a backend input kind to the known union, defaulting to "choice". */
function normalizeInputKind(raw: unknown,): RpgQuestionInputKind {
  return raw === "free_text" || raw === "numeric" ? raw : "choice";
}

export const rpgQuestions: Partial<ChatState> & ThisType<ChatState> = {
  rpgQuestions: [] as RpgQuestionView[],
  rpgQuestionsLoading: false,
  rpgQuestionsError: null as string | null,
  _answeringQuestionId: null as string | null,
  _pendingAnswer: null as RpgQuestionPendingAnswer | null,

  async loadOpenQuestions() {
    const activeChat = this.activeChat;
    if (!activeChat) {
      this.rpgQuestions = [];
      return;
    }

    this.rpgQuestionsLoading = true;
    this.rpgQuestionsError = null;
    try {
      const res = await apiFetch(`/api/v1/chats/${activeChat}/questions`,);
      if (!res.ok) {
        this.rpgQuestions = [];
        return;
      }
      const data = await res.json();
      this.rpgQuestions = (data.questions ?? []).map((q: Record<string, unknown>,) => ({
        id: String(q.id ?? "",),
        type: String(q.type ?? "custom",),
        prompt: String(q.prompt ?? "",),
        options: Array.isArray(q.options,)
          ? (q.options as Record<string, unknown>[]).map((o,) => ({
            id: String(o.id ?? "",),
            text: String(o.text ?? "",),
          }))
          : [],
        inputKind: normalizeInputKind(q.inputKind,),
        minValue: (q.minValue as number | null | undefined) ?? null,
        maxValue: (q.maxValue as number | null | undefined) ?? null,
        timeLimit: (q.timeLimit as number | null | undefined) ?? null,
        requiredChoice: Number(q.requiredChoice ?? 1,),
        status: String(q.status ?? "open",),
        selectedOptionId: (q.selectedOptionId as string | null | undefined) ?? null,
      }));
    } catch {
      this.rpgQuestions = [];
      this.rpgQuestionsError = "Failed to load questions";
    } finally {
      this.rpgQuestionsLoading = false;
    }
  },

  async answerChoice(questionId: string, optionId: string,) {
    if (this._answeringQuestionId) { return; }
    this._pendingAnswer = { questionId, optionId, };
    await this._submitAnswer();
  },

  async answerValue(questionId: string, value: string | number,) {
    if (this._answeringQuestionId) { return; }
    this._pendingAnswer = { questionId, value, };
    await this._submitAnswer();
  },

  async retryAnswer() {
    await this._submitAnswer();
  },

  /** Submits the pending answer; on failure it stays pending for retry. */
  async _submitAnswer() {
    const pending = this._pendingAnswer;
    if (!pending || this._answeringQuestionId) { return; }
    this._answeringQuestionId = pending.questionId;
    this.rpgQuestionsError = null;
    try {
      const body: { optionId?: string; value?: string | number } = {};
      if (pending.optionId !== undefined) { body.optionId = pending.optionId; }
      if (pending.value !== undefined) { body.value = pending.value; }
      const res = await apiFetch(`/api/v1/questions/${pending.questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);
      if (!res.ok) {
        this.rpgQuestionsError = "Failed to record answer";
        return;
      }
      this._pendingAnswer = null;
      await this.loadOpenQuestions();
    } catch {
      this.rpgQuestionsError = "Failed to record answer";
    } finally {
      this._answeringQuestionId = null;
    }
  },
};
