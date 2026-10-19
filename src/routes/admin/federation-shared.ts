// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Cross-cutting pieces every federation admin route needs: the federation-off
 * refusal, the audit write, and the typed-enum guards.
 *
 * Federation stays OFF BY DEFAULT at every layer, so the guard is checked on
 * BOTH reads and mutations: with `config.federation.enabled = false` the panel
 * renders an explicit off state and every mutation route refuses, exactly as
 * `src/routes/federation.ts:51-53` refuses to mount at all.
 */

import type { Kysely, } from "kysely";
import {
  PEER_BUDGET_MODES,
  PEER_INSTANCE_KINDS,
  PEER_WORKLOAD_CLASSES,
  type PeerBudgetMode,
  type PeerInstanceKind,
  type PeerWorkloadClass,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { safeJsonStringify, uid, } from "../../utils";
import { ErrorCode, HttpStatus, jsonError, } from "../http-utils";

/** Logger tag for every line this surface emits. */
const log = () => getChildLogger("admin-federation",);

/**
 * Refuse when federation is off. Returns null when the route may proceed.
 * @param enabled `config.federation.enabled`
 * @returns {Response | null}
 */
export function federationOffResponse(enabled: boolean,): Response | null {
  if (enabled) { return null; }
  return jsonError({
    message: "federation is disabled on this instance",
    status: HttpStatus.ServiceUnavailable,
    code: ErrorCode.ServiceUnavailable,
  },);
}

/** A malformed origin, refused before anything is stored or probed. */
export function badOriginResponse(): Response {
  return jsonError({
    message: "origin must be an http(s) URL",
    status: HttpStatus.BadRequest,
    code: ErrorCode.BadRequest,
  },);
}

/** Narrow a submitted workload class against the closed enum. */
export function isWorkloadClass(value: unknown,): value is PeerWorkloadClass {
  return typeof value === "string" && (PEER_WORKLOAD_CLASSES as readonly string[]).includes(value,);
}

/** Narrow a submitted budget mode. */
export function isBudgetMode(value: unknown,): value is PeerBudgetMode {
  return typeof value === "string" && (PEER_BUDGET_MODES as readonly string[]).includes(value,);
}

/** Narrow a submitted instance kind. */
export function isInstanceKind(value: unknown,): value is PeerInstanceKind {
  return typeof value === "string" && (PEER_INSTANCE_KINDS as readonly string[]).includes(value,);
}

/** 400 for a value outside its closed enum, naming the accepted set. */
export function notInEnumResponse(field: string, value: string, accepted: readonly string[],): Response {
  return jsonError({
    message: `${field} must be one of: ${accepted.join(", ",)} (got ${value})`,
    status: HttpStatus.BadRequest,
    code: ErrorCode.BadRequest,
  },);
}

/**
 * Write the `log_entries` audit row for a federation configuration mutation.
 *
 * Same column set as `src/routes/admin/users.ts:169`. The `meta` blob carries
 * operator-supplied configuration only — never a shared token, which the route
 * layer is responsible for not passing here.
 *
 * An audit failure is logged and NOT propagated: the mutation has already
 * committed, and failing the response would tell the operator their change was
 * rejected when it was applied. Mirrors the existing role-change audit.
 *
 * @param options
 * @param options.database
 * @param options.actorId Authenticated admin performing the change.
 * @param options.eventType Machine-readable event name.
 * @param options.action Short action label.
 * @param options.entityType
 * @param options.entityId
 * @param options.message Human-readable summary. Must name no secret.
 * @param options.meta Structured detail. Must name no secret.
 * @returns {Promise<void>}
 */
export async function auditFederationChange(options: {
  database: Kysely<DB>;
  actorId: string;
  eventType: string;
  action: string;
  entityType: string;
  entityId: string;
  message: string;
  meta: Record<string, unknown>;
},): Promise<void> {
  const meta = safeJsonStringify(options.meta,);
  try {
    await options.database
      .insertInto("log_entries",)
      .values({
        id: uid(),
        level: 30,
        timestamp: Date.now() / 1000,
        time: new Date().toISOString(),
        message: options.message,
        module: "admin-federation",
        user_id: options.actorId,
        event_type: options.eventType,
        entity_type: options.entityType,
        entity_id: options.entityId,
        action: options.action,
        meta: meta.ok ? meta.value : "{}",
      },)
      .execute();
  } catch (error) {
    log()?.warn("federation audit write failed", { eventType: options.eventType, error: String(error,), },);
  }
}
