// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Composer pre-send helpers - facade that re-exports the factory, type
 * surface, and pure helpers from `composer-pre-send/`. The submodules keep
 * each concern under the AGENTS.md <200L ceiling:
 *
 *   - `constants.ts`        - TTL + storage key
 *   - `send-gate.ts`        - types + `computeSendBlocked` + reason text
 *   - `draft-codec.ts`      - `StoredDraft` + `decodeStoredDraft`
 *   - `validate.ts`         - `validatePreSend`
 *   - `composer-pre-send.ts` (this file) - factory + reactive state shape
 *
 * Ticket: TASK-chat-feature-entry-field-pre-send.
 */

import { stripLeadingMention, } from "../../group-chat/mention-parser";
import { DRAFT_STORAGE_KEY, DRAFT_TTL_MS, } from "./composer-pre-send/constants";
import { decodeStoredDraft, type StoredDraft, } from "./composer-pre-send/draft-codec";
import {
  type ComposerPreSendDeps,
  type ComposerPreSendState,
  computeSendBlocked,
  type PreSendValidation,
  type SendBlockedReason,
  sendBlockedReasonText,
  type SendGateInputs,
} from "./composer-pre-send/send-gate";
import { validatePreSend, } from "./composer-pre-send/validate";
import { safeJsonParse, safeJsonStringify, } from "./json";

export { DRAFT_STORAGE_KEY, DRAFT_TTL_MS, };
export type {
  ComposerPreSendDeps,
  ComposerPreSendState,
  PreSendValidation,
  SendBlockedReason,
  SendGateInputs,
  StoredDraft,
};
export { computeSendBlocked, decodeStoredDraft, sendBlockedReasonText, validatePreSend, };

/**
 * Factory: build the composer pre-send state object. Pulled out of
 * `bootstrap.ts` so the surface can be exercised without an Alpine
 * component instance.
 * @param deps
 */
export function createComposerPreSend(deps: ComposerPreSendDeps = {},): ComposerPreSendState {
  const storage = deps.storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? (globalThis as { localStorage?: Storage }).localStorage ?? null
      : null);
  const now = deps.now ?? Date.now;

  return {
    _draftStorageKey: DRAFT_STORAGE_KEY,
    _draftTtlMs: DRAFT_TTL_MS,
    _sendBlockedReason: null,
    _sendBlockedHint: "",
    restoreDraft(chatId: string,): string | null {
      if (!storage || !chatId) { return null; }
      const raw = storage.getItem(DRAFT_STORAGE_KEY,);
      if (!raw) { return null; }
      try {
        const mapResult = safeJsonParse<Record<string, unknown>>(raw,);
        if (!mapResult.ok) { return null; }
        const map = mapResult.value;
        const entry = map[chatId];
        if (!entry) { return null; }
        const entryJson = safeJsonStringify(entry,);
        const decoded = entryJson.ok ? decodeStoredDraft(entryJson.value, now,) : null;
        if (!decoded || decoded.chatId !== chatId) {
          // Evict malformed / mismatched / expired entries so a stale key does
          // not linger across reloads.
          delete map[chatId];
          const cleanupJson = safeJsonStringify(map,);
          if (cleanupJson.ok) { storage.setItem(DRAFT_STORAGE_KEY, cleanupJson.value,); }
          return null;
        }
        return decoded.text;
      } catch {
        return null;
      }
    },
    persistDraft(chatId: string, text: string,): void {
      if (!storage || !chatId) { return; }
      let map: Record<string, unknown> = {};
      const raw = storage.getItem(DRAFT_STORAGE_KEY,);
      if (raw) {
        const loadResult = safeJsonParse<Record<string, unknown>>(raw,);
        if (loadResult.ok) { map = loadResult.value; }
      }
      if (text.trim().length === 0) {
        delete map[chatId];
      } else {
        map[chatId] = { chatId, text, savedAt: now(), } satisfies StoredDraft;
      }
      const persistJson = safeJsonStringify(map,);
      if (persistJson.ok) { storage.setItem(DRAFT_STORAGE_KEY, persistJson.value,); }
    },
    isSendBlocked(inputs: SendGateInputs,): SendBlockedReason | null {
      const reason = computeSendBlocked(inputs,);
      (this as ComposerPreSendState)._sendBlockedReason = reason;
      (this as ComposerPreSendState)._sendBlockedHint = reason === null ? "" : sendBlockedReasonText(reason,);
      return reason;
    },
    validateDraft(text, participants, pendingAssetIds,) {
      return validatePreSend(text, participants, pendingAssetIds,);
    },
  };
}

/**
 * Compose the `validateDraft` shim. Kept as a separate export so the factory
 * stays minimal while the template-friendly surface (with the validator
 * wired in) is one symbol the bootstrap imports.
 * @param factory
 */
export function attachValidateDraft(factory: ComposerPreSendState,): ComposerPreSendState {
  return {
    ...factory,
    validateDraft(text, participants, pendingAssetIds,) {
      return validatePreSend(text, participants, pendingAssetIds,);
    },
  };
}

/** Re-exported so the test surface has a single entry point. */
export { stripLeadingMention, };
