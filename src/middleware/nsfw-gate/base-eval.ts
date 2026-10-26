// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure per-user NSFW base-gate evaluator plus batched loaders.
 *
 * `evaluateNsfwBase` is the single source of truth both `canAccessNsfw`
 * and the participant weakest-link check delegate to, so single and
 * multi-user paths cannot drift. `loadGateInputs` fetches raw inputs for N
 * users in two queries total instead of 2N.
 */
import type { Kysely, } from "kysely";
import { getRuntimeConfig, } from "../../age-gate/controller";
import { getStatus, } from "../../age-gate/service";
import type { DB, } from "../../db";
import { calculateAge, } from "../../utils/date";

/**
 * Raw per-user inputs for the base NSFW decision. Loaded in batch by
 * `loadGateInputs` so multi-user checks (participant weakest link) cost two
 * queries total instead of 2N.
 */
export interface GateInputs {
  /** `birth_date` column; null when unset. */
  birthDate: string | null;
  /** `age_gate_accepted_at` column; null when never accepted. */
  ageGateAcceptedAt: string | null;
  /** `nsfw_user_preferences.access_status`; null when no prefs row (clear). */
  accessStatus: string | null;
}

/**
 * Pure base-gate decision over pre-loaded inputs. Single source of truth —
 * `canAccessNsfw` and the batched participant check both delegate here, so
 * single and multi-user paths cannot drift.
 *
 * The AGE verdict delegates to the `ageGate.*` runtime config via
 * {@link getStatus} — the same function `checkAgeGate` (chats/create.ts)
 * uses — so both gates return the same verdict for any given user and the
 * `nsfw.nsfwMinAge` key no longer influences age passing
 * (BUG-two-gates-age-gate-keys).
 * @param gateConfig NSFW feature toggle.
 * @param gateConfig.allowNsfw
 * @param inputs Pre-loaded user/prefs row, or undefined when the user is unknown.
 * @param opts `ignoreModeration` skips the banned/blocked denial — server-side
 *   backends (e.g. own-settings provisioning) that read, rather than enforce,
 *   moderation state. NEVER expose to client input.
 * @param opts.ignoreModeration
 * @returns {{ allowed: boolean; reason?: string | undefined; }}
 */
export function evaluateNsfwBase(
  gateConfig: { allowNsfw: boolean },
  inputs: GateInputs | undefined,
  opts?: { ignoreModeration?: boolean },
): { allowed: boolean; reason?: string } {
  if (!gateConfig.allowNsfw) {
    return { allowed: false, reason: "nsfw_disabled", };
  }

  if (!inputs) {
    return { allowed: false, reason: "user_not_found", };
  }

  if (!opts?.ignoreModeration) {
    if (inputs.accessStatus === "banned") {
      return { allowed: false, reason: "banned", };
    }

    if (inputs.accessStatus === "blocked") {
      return { allowed: false, reason: "blocked", };
    }
  }

  // Age component: shared verdict function with checkAgeGate. When the age
  // gate is disabled/mode none, getStatus passes — NSFW enforcement of the
  // age component follows the ageGate.* section, not nsfw.nsfwMinAge.
  const ageGate = getRuntimeConfig();
  const status = getStatus(ageGate, {
    birth_date: inputs.birthDate,
    age_gate_accepted_at: inputs.ageGateAcceptedAt,
  },);

  if (!status.hasPassed) {
    // Reason is diagnostic only — the verdict itself comes from getStatus.
    if (!inputs.ageGateAcceptedAt) {
      return { allowed: false, reason: "age_gate_not_accepted", };
    }

    const age = inputs.birthDate ? calculateAge(inputs.birthDate,) : null;
    const reason = age !== null && age < ageGate.minimumAge ? `underage:${age}` : "age_gate_not_passed";
    return { allowed: false, reason, };
  }

  return { allowed: true, };
}

/**
 * Load gate inputs for many users in two queries (users + prefs).
 * Missing users are absent from the map (`evaluateNsfwBase` reads absence
 * as `user_not_found`); missing prefs rows read as clear (null status).
 * @param database
 * @param userIds
 * @returns {Promise<Map<string, GateInputs>>}
 */
export async function loadGateInputs(
  database: Kysely<DB>,
  userIds: string[],
): Promise<Map<string, GateInputs>> {
  const result = new Map<string, GateInputs>();
  const unique = [...new Set(userIds,),];
  if (unique.length === 0) {
    return result;
  }

  // Sequential awaits: two dependent-shaped reads on one connection; the
  // Promise.all form trips the no-unhandled-rejection lint.
  const users = await database
    .selectFrom("users",)
    .select(["id", "birth_date", "age_gate_accepted_at",],)
    .where("id", "in", unique,)
    .execute();

  const prefs = await database
    .selectFrom("nsfw_user_preferences",)
    .select(["user_id", "access_status",],)
    .where("user_id", "in", unique,)
    .execute();

  const statusByUser = new Map(prefs.map((p,) => [p.user_id, p.access_status,]),);
  for (const user of users) {
    result.set(user.id, {
      birthDate: user.birth_date,
      ageGateAcceptedAt: user.age_gate_accepted_at,
      accessStatus: statusByUser.get(user.id,) ?? null,
    },);
  }

  return result;
}

/**
 * Batched weakest-link check: first participant (excluding `excludeUserId`)
 * that fails the base gate, or null when all clear. Two queries total
 * regardless of participant count.
 * @param database
 * @param gateConfig `allowNsfw` toggle and `nsfwMinAge` threshold.
 * @param gateConfig.allowNsfw
 * @param gateConfig.nsfwMinAge
 * @param participantUserIds User-backed participant ids (AI/system actors
 *   carry no user and are excluded upstream by `getChatParticipantUserIds`).
 * @param excludeUserId Already-checked requester to skip.
 * @returns {Promise<{ userId: string; reason: string; } | null>}
 */
export async function findBlockedParticipant(
  database: Kysely<DB>,
  gateConfig: { allowNsfw: boolean },
  participantUserIds: string[],
  excludeUserId?: string,
): Promise<{ userId: string; reason: string } | null> {
  const others = participantUserIds.filter((id,) => id !== excludeUserId);
  if (others.length === 0) {
    return null;
  }

  const inputs = await loadGateInputs(database, others,);
  for (const id of others) {
    const decision = evaluateNsfwBase(gateConfig, inputs.get(id,),);
    if (!decision.allowed) {
      return { userId: id, reason: decision.reason ?? "unknown", };
    }
  }

  return null;
}
