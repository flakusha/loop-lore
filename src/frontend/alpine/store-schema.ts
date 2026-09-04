// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Alpine store schema — runtime defaults + dev-only shape assertions for the
 * `$store.chat` payload.
 *
 * The chat-view templates read `$store.chat.children` / `$store.chat.visibility`
 * during Alpine init(); without a sane initial shape they crash with
 * "Cannot read properties of undefined (reading 'children')" /
 * "... of null (reading 'visibility')", aborting the chat-view mount and
 * leaving #chat-list unrendered — see BUG-alpine-init-crash-chat-view-store-undefined.
 *
 * `applyChatViewDefaults` is the runtime safety net (called from the stores
 * registry at module init); `assertChatViewShape` is the dev-only guard that
 * fails loud if a future caller forgets to seed those fields.
 */
import { safeJsonStringify, } from "../../utils";

import { safeJsonStringify } from "../../utils";

/** Visibility modes accepted by chat-view templates. */
export type ChatVisibility = "visible" | "hidden" | "collapsed";

/** Required shape for the chat-view store payload. */
export interface ChatViewShape {
  currentChat: { id: string; name?: string; type?: string } | null;
  children: unknown[];
  visibility: ChatVisibility;
}

/** Required field names — used by `assertChatViewShape` for clear errors. */
const REQUIRED_FIELDS = ["currentChat", "children", "visibility",] as const;

/**
 * Apply safe defaults to the chat-view store payload. Idempotent — does not
 * overwrite fields that already have acceptable values (matches the
 * "belt-and-suspenders" semantics used by chatLifecycle.init()).
 */
export function applyChatViewDefaults(store: unknown,): void {
  if (store == null || typeof store !== "object") { return; }
  // Narrowed: typeof guard above guarantees an object, so a cast to the
  // writable shape is safe inside this branch.
  const draft = store as ChatViewShape;
  if (!Array.isArray(draft.children,)) { draft.children = []; }
  if (typeof draft.visibility !== "string" || !draft.visibility) {
    draft.visibility = "visible";
  }
}

/**
 * Dev-only shape assertion. Throws a descriptive error if any required
 * field is missing or has the wrong type. No-op when `NODE_ENV` is `production`
 * so production bundles never pay for the check.
 *
 * Accepts the wider `unknown` parameter on purpose: this runs against the
 * loosely-typed Alpine store payload before the chat view has narrowed it.
 */
export function assertChatViewShape(store: unknown,): void {
  if (process.env.NODE_ENV === "production") { return; }
  if (store == null || typeof store !== "object") {
    throw new TypeError(
      `[store-schema] chat store must be an object, got ${store === null ? "null" : typeof store}`,
    );
  }
  const draft = store as Record<string, unknown>;
  for (const field of REQUIRED_FIELDS) {
    if (!(field in draft)) {
      throw new TypeError(
        `[store-schema] chat store missing required field "${field}"`,
      );
    }
  }
  if (!Array.isArray(draft.children,)) {
    throw new TypeError(
      `[store-schema] chat.children must be an array, got ${typeof draft.children}`,
    );
  }
  if (typeof draft.visibility !== "string" || draft.visibility === "") {
    throw new TypeError(
      `[store-schema] chat.visibility must be a non-empty string, got ${safeJsonStringify(draft.visibility,)}`,
    );
  }
}
