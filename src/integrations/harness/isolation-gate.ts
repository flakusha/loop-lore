// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * isolation-gate.ts — the per-user isolation gate for external harness
 * execution (TASK-per-user-isolation-gate).
 *
 * Every harness spawn passes through {@link assertHarnessExecution}, which
 * enforces, in order:
 *
 * 1. master switch — `harness.acp.enabled` must be on;
 * 2. role gate — `isAdminRole` (solo/admin), checked explicitly and NOT
 *    implied by any route's `auth.required`;
 * 3. profile allowlist — the executed profile must exist in the
 *    admin-owned `harness.acp.profiles` config, so the spawn argv is always
 *    the configured official binary command and never caller-supplied.
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

/** What {@link assertHarnessExecution} resolves with — denies are values, never throws. */
export type HarnessIsolationVerdict =
  | {
    allowed: true;
    /** The admin-configured profile; its `command` is the only spawn argv. */
    profile: AcpProfileConfig;
    /** The single principal this execution is attributed to. */
    userId: string | null;
  }
  | { allowed: false; code: "harness_disabled" | "role_denied" | "profile_unknown"; message: string };

/** Input for the isolation gate. */
export interface HarnessIsolationInput {
  /** The loaded `harness` config section (server-wide admin config). */
  config: HarnessConfig;
  /** Caller's site role, resolved the way the HTTP layer does; null = anonymous. */
  role: string | null;
  /** Authenticated user id the execution is attributed to; null = unattributed. */
  userId: string | null;
  /** Name of the configured profile to execute. */
  profileName: string;
}

/**
 * Decide whether external harness execution may start.
 * @param input - config, caller role, principal, and profile name
 * @returns the verdict; `allowed` carries the profile whose `command` is the
 * only argv the caller may spawn.
 * @throws {Error} never — every denial is a typed value.
 */
export function assertHarnessExecution(input: HarnessIsolationInput,): HarnessIsolationVerdict {
  const { config, role, userId, profileName, } = input;
  if (!config.acp.enabled) {
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

  const profile = config.acp.profiles.find((p,) => p.name === profileName);
  if (!profile) {
    return {
      allowed: false,
      code: "profile_unknown",
      message: `no harness profile configured under name "${profileName}" — only admin-configured profiles may run`,
    };
  }

  return { allowed: true, profile, userId, };
}
