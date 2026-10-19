// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Age Gate — self-declaration birth-date form state and the app-wide guard.
 *
 * Speaks the JSON contract in `src/age-gate/controller.ts`:
 *   GET  /api/v1/age-gate/status → { isEnabled, hasPassed, minimumAge, mode }
 *   POST /api/v1/age-gate/accept ← { birthDate: "YYYY-MM-DD" }
 * Accept answers 200 `{ ok: true }`, 400 on a malformed date, 403 when the
 * declared date is below `minimumAge`.
 *
 * `apiFetch` delegates to `feFetch`, which REJECTS on any non-2xx (src/frontend/
 * fe-fetch.ts:98-111) — the body is never surfaced, so the underage/invalid
 * text is unrecoverable client-side and the status is read off the thrown
 * error instead. Those messages are therefore rendered from the locale
 * catalog rather than echoed from the server, which also localizes them: the
 * controller's `jsonError` calls carry no `t`, so its English never translates.
 */

import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";

/** The gate screen. Redirect target for `enforceAgeGate`, exempt from itself. */
const AGE_GATE_PATH = "/views/age-gate";

/**
 * Where a user with nothing left to verify belongs. Matches auth's success target.
 */
const AGE_GATE_PASSED_TARGET = "/views/chat";

/**
 * Shipped default, used when the status call fails. The server re-validates on accept.
 */
const AGE_GATE_FALLBACK_MIN_AGE = 18;

/**
 * Paths the guard must never redirect FROM.
 *
 * `/views/login` and `/views/register` are exempt for a reason that a unit test
 * with a mocked fetch cannot see: those pages are layout-wrapped, so
 * `app().init()` — and therefore this guard — runs on them too. An anonymous
 * visitor on /views/login gets a 401 from /age-gate/status, which `feFetch`
 * answers by bouncing to `/views/login?redirect=…` (fe-fetch.ts:86-94, itself
 * loop-guarded to skip the login path). The guard would then redirect that same
 * login page to /views/age-gate, which 401s, which bounces back to login — a
 * real browser loop between /views/age-gate and /views/login. Observed in the
 * Playwright run; see age-gate-guard.browser.ts "NO LOOP" tests.
 *
 * An anonymous user cannot accept the gate anyway (`handleAccept` 401s without
 * a userId), so skipping them loses nothing: they authenticate first, and the
 * very next layout-wrapped page load runs the guard for real.
 */
const AGE_GATE_GUARD_EXEMPT = new Set([AGE_GATE_PATH, `${AGE_GATE_PATH}/`, "/views/login", "/views/register",],);

/** Shape of `GET /api/v1/age-gate/status`. */
interface AgeGateStatus {
  isEnabled: boolean;
  hasPassed: boolean;
  minimumAge: number;
}

/** `feFetch` stashes the HTTP status on the rejected Error so callers can branch. */
type StatusError = Error & { status?: number };

/**
 * Redirect a gated user to the verification screen. Called from `app().init()`
 * (src/frontend/alpine/app.ts) because `<body x-data="app()">` is present on
 * every layout-wrapped page, so every landed user passes through here.
 *
 * Loop-freedom — the exemption set is the first gate, checked before any fetch:
 *   on an exempt path (gate screen, login, register) → return, no fetch at all
 *   status unreadable                          → return (fail open, never strand)
 *   !isEnabled                                 → return (disabled gate never redirects)
 *   hasPassed                                  → return (accepted users are never sent back)
 *   enabled && !hasPassed                      → assign(AGE_GATE_PATH)
 *
 * Converges in at most one redirect per load: the redirect target is itself
 * exempt, so the next evaluation returns without fetching or navigating.
 * @returns {Promise<void>} resolves once the decision is made
 */
export async function enforceAgeGate(): Promise<void> {
  const path = globalThis.location?.pathname ?? "";
  if (AGE_GATE_GUARD_EXEMPT.has(path,)) { return; }

  try {
    const res = await apiFetch("/api/v1/age-gate/status",);
    const status = await res.json() as AgeGateStatus;

    if (status.isEnabled && !status.hasPassed) {
      globalThis.location?.assign(AGE_GATE_PATH,);
    }
  } catch {
    // Status unreadable (401 before login, offline, 500). Fail OPEN: never
    // strand a user on a screen they cannot leave. The server re-validates on
    // every gated action, so skipping the client redirect loses nothing.
  }
}

interface AgeGateComponent {
  _birthDate: string;
  _consent: boolean;
  _error: string;
  _submitting: boolean;
  _minimumAge: number;
  minAgeText(): string;
  init(): Promise<void>;
  canSubmit(): boolean;
  submit(): Promise<void>;
}

(globalThis as unknown as Record<string, unknown>).ageGate = function(): AgeGateComponent {
  return {
    _birthDate: "",
    _consent: false,
    _error: "",
    _submitting: false,
    _minimumAge: AGE_GATE_FALLBACK_MIN_AGE,

    /**
     * Minimum-age sentence for the live `_minimumAge`.
     *
     * Built here, NOT via the `$t` magic: that magic (src/frontend/alpine-init.ts:79)
     * is a single-argument lookup that does not interpolate, so `$t("ageGate.minimumAge",
     * { age })` would render a literal `{age}` to the user. This module's `t` is the
     * real interpolating translator.
     */
    minAgeText(): string {
      return t("ageGate.minimumAge", { age: this._minimumAge, },);
    },

    async init() {
      // The app-wide guard already redirects gated users here, so this screen
      // only has to handle the two ways a user can still be standing on it:
      // the gate got disabled, or they already accepted (e.g. back button).
      try {
        const res = await apiFetch("/api/v1/age-gate/status",);
        const status = await res.json() as AgeGateStatus;
        this._minimumAge = typeof status.minimumAge === "number" ? status.minimumAge : AGE_GATE_FALLBACK_MIN_AGE;

        if (!status.isEnabled || status.hasPassed) {
          globalThis.location?.assign(AGE_GATE_PASSED_TARGET,);
        }
      } catch {
        // Leave the fallback age and the form in place; accept re-validates.
      }
    },

    // A `YYYY-MM-DD` value AND the consent checkbox — an empty date is the
    // one case the native date input will not block for us.
    canSubmit(): boolean {
      return !this._submitting && /^\d{4}-\d{2}-\d{2}$/.test(this._birthDate,) && this._consent;
    },

    async submit(): Promise<void> {
      if (!this.canSubmit()) { return; }

      this._submitting = true;
      this._error = "";

      try {
        const res = await apiFetch("/api/v1/age-gate/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ birthDate: this._birthDate, },),
        },);

        if (res.ok) {
          globalThis.location?.assign(AGE_GATE_PASSED_TARGET,);
          return;
        }

        this._error = t("ageGate.errorGeneric",);
      } catch (error) {
        const status = (error as StatusError).status;
        if (status === 403) {
          this._error = t("ageGate.errorUnderage", { age: this._minimumAge, },);
        } else if (status === 400) {
          this._error = t("ageGate.errorInvalidDate",);
        } else {
          this._error = t("ageGate.errorGeneric",);
        }
      } finally {
        this._submitting = false;
      }
    },
  };
};
