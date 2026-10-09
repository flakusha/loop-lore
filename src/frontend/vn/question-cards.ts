// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Question Cards
 *
 * Renders the Q&A question cards a VN scene surfaces and records the player's
 * answer. Mirrors ./choice-cards.ts: same module state, same apiFetch/jsonBody
 * seam, same "side effects never lose the recorded answer" discipline.
 */
import { apiFetch, } from "../alpine/htmx";
import { jsonBody, } from "../alpine/json";
import { renderQuestionCards, } from "./question-cards-render";

const LOCATION_CHANGED_EVENT = "chat:location-changed";

/** */
export interface VnQuestionOption {
  id: string;
  text: string;
  emotion_modifier: number;
  relationship_modifier: number;
  next_scene_id: string | null;
  consequence: Record<string, unknown> | null;
}

/** */
export interface VnQuestion {
  id: string;
  chat_id: string;
  scene_index: number;
  question_type: string;
  question_text: string;
  speaker_id: string | null;
  options: VnQuestionOption[];
  next_scene_id: string | null;
  consequences: Record<string, unknown>;
  relationship_impact: Record<string, number>;
  mood_impact: Record<string, number>;
  status: string;
  selected_option_id: string | null;
  answered_at: string | null;
  created_at: string;
}

/** Return type from answerQuestion including the location change result. */
export interface AnswerQuestionResult {
  question: VnQuestion;
  option: VnQuestionOption;
  nextSceneId: string | null;
  locationId?: string;
  locationChanged: boolean;
}

/** Shape the answer endpoint returns. */
interface AnsweredPayload {
  question: VnQuestion;
  option: VnQuestionOption;
  nextSceneId: string | null;
  locationId?: string;
}

let questions: VnQuestion[] = [];
let container: HTMLElement | null = null;
let chatId: string | null = null;
let sceneIndex = 0;

/**
 * Initialize the question cards component.
 * @param containerEl
 * @param currentChatId
 * @param currentSceneIndex
 */
export function initQuestionCards(
  containerEl: HTMLElement,
  currentChatId: string,
  currentSceneIndex: number,
): void {
  container = containerEl;
  chatId = currentChatId;
  sceneIndex = currentSceneIndex;
}

/** Destroy the question cards component. */
export function destroyQuestionCards(): void {
  container = null;
  chatId = null;
  questions = [];
}

/**
 * Load available questions for the current scene from the API.
 * @returns {Promise<void>}
 */
export async function loadQuestions(): Promise<void> {
  if (!chatId) { return; }
  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-questions?sceneIndex=${sceneIndex}`,);
    if (!res.ok) { return; }
    const data = await res.json();
    const raw: VnQuestion[] = data.questions ?? data.data ?? [];
    questions = Array.from(raw, (q,) => ({ ...q, options: q.options ?? [], }),);

    renderQuestions();
  } catch {
    questions = [];
  }
}

/**
 * Answer a question, then apply its best-effort side effects.
 *
 * The answer is recorded first and returned even when a side effect fails —
 * same contract as `selectChoice`.
 * @param questionId
 * @param optionId
 * @returns {AnswerQuestionResult} on success, null on failure.
 */
export async function answerQuestion(
  questionId: string,
  optionId: string,
): Promise<AnswerQuestionResult | null> {
  if (!chatId) { return null; }
  const idx = questions.findIndex((q,) => q.id === questionId);
  if (idx === -1) { return null; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/vn-questions/${questionId}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ optionId, },),
    },);

    if (!res.ok) { return null; }
    const data = await res.json();
    const { question: returned, option, nextSceneId, locationId, } = data as AnsweredPayload;

    const updated: VnQuestion = { ...returned, status: "answered", selected_option_id: optionId, };
    questions = Array.from(questions, (q, i,) => (i === idx ? updated : q),);

    let locationChanged = false;
    if (locationId) {
      try {
        const locRes = await apiFetch(`/api/v1/chats/${chatId}/location`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ locationId, },),
        },);

        if (locRes.ok) {
          globalThis.dispatchEvent(
            new CustomEvent(LOCATION_CHANGED_EVENT, {
              detail: { chatId, locationId, locationName: null, },
            },),
          );

          locationChanged = true;
        }
      } catch {
        // Location change is best-effort; the answer itself already persisted.
      }
    }

    renderQuestions();

    return { question: returned, option, nextSceneId, locationId, locationChanged, };
  } catch {
    return null;
  }
}

/**
 * Internal: dispatch to renderQuestionCards in ./question-cards-render.ts
 */
function renderQuestions(): void {
  if (!container) { return; }
  renderQuestionCards(container, questions, (questionId, optionId,) => {
    void answerQuestion(questionId, optionId,);
  },);
}
