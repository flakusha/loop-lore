// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Proactive Messaging Config — Frontend Logic
 *
 * Loaded by characters.ts page. Loads proactive messaging config
 * from the character edit form (frequency, quiet hours, enabled).
 */
import { jsonBody, } from "../alpine/json";
import type { feFetch, } from "../fe-fetch";

// Shared feFetch — caller passes it in to avoid circular import
let _feFetch: typeof feFetch;

/**
 * @param fetchFn
 */
export function initProactive(fetchFn: typeof feFetch,) {
  _feFetch = fetchFn;
}

// ── Proactive Messaging: load on form init ──────────────────

(globalThis as Record<string, unknown>).loadProactiveConfig = async function(actorId: string,) {
  const params = new URLSearchParams(location.search,);
  const chatId = params.get("chatid",) || params.get("chatId",);
  if (!chatId) {
    const status = document.querySelector<HTMLElement>("#proactive-status",);
    if (status) { status.textContent = "Configure from a chat session to set proactive messaging."; }
    return;
  }
  try {
    const res = await _feFetch(`/api/proactive-messaging/config?chatId=${chatId}&actorId=${actorId}`,);
    if (res.ok) {
      const data = await res.json();
      const freq = document.querySelector<HTMLSelectElement>("#proactive-frequency",);
      const enabled = document.querySelector<HTMLInputElement>("#proactive-enabled",);
      const qs = document.querySelector<HTMLInputElement>("#proactive-quiet-start",);
      const qe = document.querySelector<HTMLInputElement>("#proactive-quiet-end",);
      if (freq) { freq.value = data.frequency || "normal"; }
      if (enabled) { enabled.checked = data.enabled !== false; }
      if (qs && data.quietHoursStart) { qs.value = data.quietHoursStart; }
      if (qe && data.quietHoursEnd) { qe.value = data.quietHoursEnd; }
    }
  } catch { /* no config yet */ }
};

// ── Proactive Messaging: save on form submit ──────────────────

(globalThis as Record<string, unknown>).saveProactiveConfig = async function(actorId: string,) {
  const params = new URLSearchParams(location.search,);
  const chatId = params.get("chatid",) || params.get("chatId",);
  if (!chatId) { return false; }

  const freq = document.querySelector<HTMLSelectElement>("#proactive-frequency",)?.value;
  const enabled = document.querySelector<HTMLInputElement>("#proactive-enabled",)?.checked;
  const qs = document.querySelector<HTMLInputElement>("#proactive-quiet-start",)?.value;
  const qe = document.querySelector<HTMLInputElement>("#proactive-quiet-end",)?.value;

  const status = document.querySelector<HTMLElement>("#proactive-status",);
  try {
    const res = await _feFetch(`/api/proactive-messaging/config?chatId=${chatId}&actorId=${actorId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", },
      body: jsonBody({
        frequency: freq ?? "normal",
        enabled: enabled !== false,
        quietHoursStart: qs || null,
        quietHoursEnd: qe || null,
      },),
    },);
    if (res.ok) {
      if (status) { status.textContent = "Proactive messaging updated."; }
      return true;
    }
    if (status) { status.textContent = "Failed to save proactive messaging."; }
    return false;
  } catch {
    if (status) { status.textContent = "Failed to save proactive messaging."; }
    return false;
  }
};
