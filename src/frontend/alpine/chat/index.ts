// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Chat page component (chat.html) — global bootstrap wiring ────
import { jsonParseOr, } from "../json";
import { chatState, } from "./bootstrap";

const g = globalThis as Record<string, unknown>;

g.isChatPaused = (chat: Record<string, unknown>,): boolean => {
  if (!chat?.story_state) { return false; }
  const state = jsonParseOr<Record<string, unknown>>(chat.story_state as string, {},);
  return state.isPaused === true;
};

g.toggleGroupPause = async function() {
  const el = document.querySelector<HTMLElement>("[x-data]",);
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el,);
    const fn = data.toggleGroupPause as (() => Promise<void>) | undefined;
    if (typeof fn === "function") {
      await fn();
    }
  }
};

// Register the chat page's reactive Alpine state (plain function kept on
// globalThis so Alpine's x-data="chatState" resolves it as a component).
globalThis.chatState = chatState;
