// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Questions Component (TASK-029)
 *
 * Loads a chat's open questions from `/api/v1/chats/:chatId/questions` and
 * renders them as clickable option buttons (see chat/rpg-questions.html).
 * Answering posts to `/api/v1/questions/:id/answer`, then refreshes the list.
 */

import { apiFetch, } from "./htmx.js";
import { jsonBody, } from "./json.js";
import type { ChatState, RpgQuestionView, } from "./types.js";

export const rpgQuestions: Partial<ChatState> & ThisType<ChatState> = {
  rpgQuestions: [] as RpgQuestionView[],
  rpgQuestionsLoading: false,
  rpgQuestionsError: null as string | null,
  _answeringQuestionId: null as string | null,

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

  async answerRpgQuestion(questionId: string, optionId: string,) {
    if (this._answeringQuestionId) { return; }
    this._answeringQuestionId = questionId;
    this.rpgQuestionsError = null;
    try {
      const res = await apiFetch(`/api/v1/questions/${questionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ optionId, },),
      },);
      if (!res.ok) {
        this.rpgQuestionsError = "Failed to record answer";
      }
    } catch {
      this.rpgQuestionsError = "Failed to record answer";
    } finally {
      this._answeringQuestionId = null;
      await this.loadOpenQuestions();
    }
  },
};
