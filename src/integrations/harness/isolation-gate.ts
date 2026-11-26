// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * isolation-gate.ts — the per-user isolation gate for external harness
 * execution (TASK-per-user-isolation-gate).
 *
 * Every harness spawn passes through {@link assertHarnessExecution}, which
 * enforces, in order:
 *
 * 1. master switch — the effective admin-settings view must be on (the UI
 *    toggle wins over the file config once the store is seeded; an
 *    unseeded store falls back to the file layer);
 * 2. role gate — `isAdminRole` (solo/admin), checked explicitly and NOT
 *    implied by any route's `auth.required`;
 * 3. profile admission — a pinned name must exist in the admin-owned
 *    `harness.acp.profiles` config, so the spawn argv is always the configured
 *    official binary command and never caller-supplied. `default`, omitted and
 *    empty names are UNPINNED: the selector's failover order decides, but only
 *    when at least one profile is configured. No profile is ever synthesized.
 *
 * Config storage is the server-wide admin config section (`harness.acp`);
 * per-user overrides do not exist. Isolation follows from the verdict: one
 * allowed execution is attributed to exactly one `userId`, and the returned
 * profile is the only thing a caller may spawn — subscriptions are never
 * shared across users because each binding carries a single principal.
 * Fail-closed: disabled config, unknown roles, and unknown profiles deny.
 */

import { type AcpProfileConfig, type HarnessConfig, } from "../../config/schema/harness";
import { isAdminRole, } from "../../users/roles";
import { getHarnessAdminSettings, isHarnessAdminSettingsSeeded, } from "./admin-settings";

/** What {@link assertHarnessExecution} resolves with — denies are values, never throws. */
export type HarnessIsolationVerdict =
  | {
    allowed: true;
    /** No profile was pinned; the selector may walk its failover order. */
    unpinned: true;
    /** Never synthesized: an unpinned turn resolves its profile in the selector. */
    profile: null;
    /** The single principal this execution is attributed to. */
    userId: string | null;
  }
  | {
    allowed: true;
    /** An exact admin-configured profile name was pinned. */
    unpinned: false;
    /** The admin-configured profile; its `command` is the only spawn argv. */
    profile: AcpProfileConfig;
    /** The single principal this execution is attributed to. */
    userId: string | null;
  }
  | { allowed: false; code: "harness_disabled" | "role_denied" | "profile_unknown"; message: string };

/** The normalized form of a caller's profile request. */
export type HarnessProfilePin =
  | { pinned: false }
  | { pinned: true; name: string };

/**
 * Normalize a caller-supplied profile name before admission.
 * `default`, omitted and empty ask for implicit failover; every other string
 * is an exact pinned name and still goes through the allowlist.
 * @returns a discriminated pin/unpin request; never a profile object.
 */
export function normalizeHarnessProfileName(name: string | undefined,): HarnessProfilePin {
  return name === undefined || name === "" || name === "default"
    ? { pinned: false, }
    : { pinned: true, name, };
}

/** Input for the isolation gate. */
export interface HarnessIsolationInput {
  /** The loaded `harness` config section (server-wide admin config). */
  config: HarnessConfig;
  /** Caller's site role, resolved the way the HTTP layer does; null = anonymous. */
  role: string | null;
  /** Authenticated user id the execution is attributed to; null = unattributed. */
  userId: string | null;
  /**
   * Exact profile name to pin. Omit, pass empty, or pass `default` for an
   * explicit unpinned request (selector failover), still gated by profile count.
   */
  profileName?: string;
}

/**
 * Decide whether external harness execution may start.
 * @param input - config, caller role, principal, and optional profile name
 * @returns a pinned allow carrying the one spawnable profile, or an unpinned
 * allow carrying none and deferring selection to the selector
 * @throws {Error} never — every denial is a typed value.
 */
export function assertHarnessExecution(input: HarnessIsolationInput,): HarnessIsolationVerdict {
  const { config, role, userId, profileName, } = input;
  // Master switch: the effective admin-settings view (UI toggle) once the
  // store is seeded; the raw file layer before boot. An unseeded store is
  // "unavailable" — unavailable means last-known-good file config, never a
  // silent widening (BUG-admin-settings-overrides-never-reach-the-harness-
  // dispatch-gu, no-downgrade AC). Authz semantics unchanged: this only
  // redirects WHERE the enabled value is read from, never who is allowed.
  const effectiveEnabled = isHarnessAdminSettingsSeeded()
    ? getHarnessAdminSettings().enabled
    : config.acp.enabled;

  if (!effectiveEnabled) {
    return {
      allowed: false,
      code: "harness_disabled",
      message: "harness.acp.enabled is false — external harness execution is off",
    };
  }

  if (!isAdminRole(role,)) {
    return {
      allowed: false,
      code: "role_denied",
      message: `harness execution requires an admin role (solo/admin); caller role: ${role ?? "anonymous"}`,
    };
  }

  const pin = normalizeHarnessProfileName(profileName,);
  if (!pin.pinned) {
    if (config.acp.profiles.length === 0) {
      return {
        allowed: false,
        code: "profile_unknown",
        message: "no harness profiles configured — an unpinned dispatch needs at least one admin-configured profile",
      };
    }

    return { allowed: true, unpinned: true, profile: null, userId, };
  }

  const profile = config.acp.profiles.find((p,) => p.name === pin.name);
  if (!profile) {
    return {
      allowed: false,
      code: "profile_unknown",
      message: `no harness profile configured under name "${pin.name}" — only admin-configured profiles may run`,
    };
  }

  return { allowed: true, unpinned: false, profile, userId, };
}
