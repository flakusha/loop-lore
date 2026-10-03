// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guards shared by every chat action that needs an active chat before it can
 * fire. One helper because the `noActiveChat` toast-and-bail block was
 * copy-pasted across a dozen action modules, and the jscpd ratchet treats
 * the duplication as a net-new clone pair on every feature that repeats it.
 */
import { t, } from "./i18n";

/** Minimal host shape these guards need; every chat action satisfies it. */
interface ToastHost {
  activeChat: string | null;
  $dispatch?: (event: string, detail: { type: string; message: string },) => void;
}

/**
 * True when the host has an active chat. Emits the standard warning toast on
 * a host that does not, so callers can `return` unconditionally. The type
 * predicate narrows `activeChat` past the guard, so the caller's later use of
 * `this.activeChat` stays `string` exactly as it was under the inline `if`.
 * @param host
 * @returns {boolean}
 */
export function requireActiveChat(host: ToastHost,): host is ToastHost & { activeChat: string } {
  if (host.activeChat) { return true; }
  host.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noActiveChat",), },);
  return false;
}
