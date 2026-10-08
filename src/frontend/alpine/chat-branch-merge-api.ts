// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  type MergeEnvelope,
  mergeErrorMessage,
} from "./chat-branch-merge-helpers";
import type {
  MergeConfirmResult,
  MergeContinueResult,
  MergePreviewResult,
} from "./chat-types/merge-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

/**
 * Initiate a merge on the server.
 * @param state
 * @param options
 * @param options.mode
 * @param options.sources
 * @returns {Promise<string | null>} mergeId or null on failure
 */
export async function initiateMergeApi(
  state: ChatState,
  options: { mode: string; sources: { tipMessageId: string; branchId: string | null }[] },
): Promise<string | null> {
  const { mode, sources, } = options;
  const chatId = state.activeChat;

  if (!chatId || sources.length < 2) { return null; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/branch-merges`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({ mode, sourceTips: sources, },),
    },);

    if (!res.ok) {
      const msg = await mergeErrorMessage(res,);
      state.$dispatch?.("show-toast", { type: "error", message: msg, },);
      return null;
    }

    const body = await res.json() as MergeEnvelope<{ mergeId?: string }>;
    const mergeId = body.data?.mergeId;

    if (!mergeId) {
      state.$dispatch?.("show-toast", { type: "error", message: t("branches.mergeFailedInitiate",), },);
      return null;
    }

    return mergeId;
  } catch {
    state.$dispatch?.("show-toast", { type: "error", message: t("branches.mergeFailedInitiate",), },);
    return null;
  }
}

/**
 * Load the preview for a merge.
 * @param state
 * @param options
 * @param options.mergeId
 * @param options.regenerate
 * @returns {Promise<MergePreviewResult | null>}
 */
export async function loadPreviewApi(
  state: ChatState,
  options: { mergeId: string; regenerate?: boolean },
): Promise<MergePreviewResult | null> {
  const { mergeId, regenerate = false, } = options;
  const chatId = state.activeChat;

  if (!chatId) { return null; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/branch-merges/${mergeId}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(regenerate ? { regenerate: true, } : {},),
    },);

    if (!res.ok) {
      const msg = await mergeErrorMessage(res,);
      state.$dispatch?.("show-toast", { type: "error", message: msg, },);
      return null;
    }

    const body = await res.json() as MergeEnvelope<MergePreviewResult>;
    return body.data ?? null;
  } catch {
    state.$dispatch?.("show-toast", { type: "error", message: t("branches.mergeFailedPreview",), },);
    return null;
  }
}

/**
 * Confirm a merge.
 * @param state
 * @param options
 * @param options.mergeId
 * @param options.branchName
 * @param options.activate
 * @param options.content
 * @param options.conflictChoices
 * @returns {Promise<MergeConfirmResult | null>}
 */
export async function confirmMergeApi(
  state: ChatState,
  options: {
    mergeId: string;
    branchName: string;
    activate: boolean;
    content?: { role: string; content: string }[];
    conflictChoices?: { hunkIndex: number; resolution: "base" | "overlay" | "manual" }[];
  },
): Promise<MergeConfirmResult | null> {
  const { mergeId, branchName, activate, content, conflictChoices, } = options;
  const chatId = state.activeChat;

  if (!chatId) { return null; }

  try {
    const body: Record<string, unknown> = { activate, };

    if (branchName) { body.branchName = branchName; }
    if (content) { body.content = content; }
    if (conflictChoices) { body.conflictChoices = conflictChoices; }

    const res = await apiFetch(`/api/v1/chats/${chatId}/branch-merges/${mergeId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(body,),
    },);

    if (!res.ok) {
      const msg = await mergeErrorMessage(res,);
      state.$dispatch?.("show-toast", { type: "error", message: msg, },);
      return null;
    }

    const result = await res.json() as MergeEnvelope<MergeConfirmResult>;
    return result.data ?? null;
  } catch {
    state.$dispatch?.("show-toast", { type: "error", message: t("branches.mergeFailedConfirm",), },);
    return null;
  }
}

/**
 * Continue from a merged tip.
 * @param state
 * @param options
 * @param options.mergeId
 * @param options.prompt
 * @returns {Promise<MergeContinueResult | null>}
 */
export async function continueFromMergeApi(
  state: ChatState,
  options: { mergeId: string; prompt?: string },
): Promise<MergeContinueResult | null> {
  const { mergeId, prompt, } = options;
  const chatId = state.activeChat;

  if (!chatId) { return null; }

  try {
    const res = await apiFetch(`/api/v1/chats/${chatId}/branch-merges/${mergeId}/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: jsonBody(prompt ? { prompt, } : {},),
    },);

    if (!res.ok) {
      const msg = await mergeErrorMessage(res,);
      state.$dispatch?.("show-toast", { type: "error", message: msg, },);
      return null;
    }

    const result = await res.json() as MergeEnvelope<MergeContinueResult>;
    return result.data ?? null;
  } catch {
    state.$dispatch?.("show-toast", { type: "error", message: t("branches.mergeFailedContinue",), },);
    return null;
  }
}
