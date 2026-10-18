// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation admin response shapes (raw TypeBox), consumed by
 * `src/frontend/alpine/admin-federation.ts` through `parseOr`.
 *
 * Declared here rather than in the route module so the browser bundle pulls in
 * only `@sinclair/typebox`, never the Kysely-backed route modules.
 *
 * There is deliberately NO shared-token field anywhere in this file. The wire
 * contract carries `hasSharedToken` (a boolean) and never the token itself, so
 * the panel has no field it could render even if it wanted to.
 */

import { Type, type Static, } from "@sinclair/typebox";

/** The operator-set performance budget for one cell. */
export const AdminFederationBudget = Type.Object({
  origin: Type.String(),
  workloadClass: Type.String(),
  mode: Type.String(),
  maxConcurrency: Type.Union([Type.Integer(), Type.Null(),]),
  maxQueueDepth: Type.Union([Type.Integer(), Type.Null(),]),
  requestsPerMinute: Type.Union([Type.Integer(), Type.Null(),]),
  tokensPerMinute: Type.Union([Type.Integer(), Type.Null(),]),
});

/**
 *
 */
export type AdminFederationBudget = Static<typeof AdminFederationBudget>;

/** Receiver-side admission counters. Absent when quotas are not enabled. */
export const AdminFederationQuotaUsage = Type.Object({
  enabled: Type.Boolean(),
  mode: Type.String(),
  inFlight: Type.Integer(),
  maxConcurrency: Type.Union([Type.Integer(), Type.Null(),]),
  headroom: Type.Union([Type.Integer(), Type.Null(),]),
  requestsRemaining: Type.Union([Type.Integer(), Type.Null(),]),
  requestsPerMinute: Type.Union([Type.Integer(), Type.Null(),]),
  tokensUsed: Type.Integer(),
  tokensPerMinute: Type.Union([Type.Integer(), Type.Null(),]),
  excluded: Type.Boolean(),
  excludedLimit: Type.Union([Type.String(), Type.Null(),]),
  excludedRetryAfterSec: Type.Integer(),
});

/**
 *
 */
export type AdminFederationQuotaUsage = Static<typeof AdminFederationQuotaUsage>;

/** One `(peer, workloadClass)` cell of the dashboard. Declared after both of
 * its dependencies so the `Type.Union` references above are already bound. */
export const AdminFederationClassCell = Type.Object({
  workloadClass: Type.String(),
  inFlight: Type.Integer(),
  maxConcurrency: Type.Union([Type.Integer(), Type.Null(),]),
  headroom: Type.Union([Type.Integer(), Type.Null(),]),
  ewmaLatencyMs: Type.Union([Type.Number(), Type.Null(),]),
  circuitOpen: Type.Boolean(),
  budget: Type.Union([AdminFederationBudget, Type.Null(),]),
  quota: Type.Union([AdminFederationQuotaUsage, Type.Null(),]),
});

/**
 *
 */
export type AdminFederationClassCell = Static<typeof AdminFederationClassCell>;

/** One peer as the dashboard shows it. Carries no secret. */
export const AdminFederationPeer = Type.Object({
  origin: Type.String(),
  displayName: Type.Union([Type.String(), Type.Null(),]),
  state: Type.String(),
  linkKind: Type.String(),
  instanceKind: Type.String(),
  authMode: Type.String(),
  workloadTrust: Type.Boolean(),
  stickyEnabled: Type.Boolean(),
  allowedWorkloadClasses: Type.Array(Type.String(),),
  advertisedWorkloadClasses: Type.Array(Type.String(),),
  /** Whether a token is stored — never the token itself. */
  hasSharedToken: Type.Boolean(),
  capacityBytes: Type.Union([Type.Integer(), Type.Null(),]),
  classes: Type.Array(AdminFederationClassCell,),
});

/**
 *
 */
export type AdminFederationPeer = Static<typeof AdminFederationPeer>;

/** GET /api/v1/admin/federation/usage. */
export const AdminFederationUsage = Type.Object({
  enabled: Type.Boolean(),
  peers: Type.Array(AdminFederationPeer,),
  storage: Type.Union([
    Type.Object({
      assetBytes: Type.Integer(),
      heldBytes: Type.Integer(),
      totalBytes: Type.Integer(),
      assetCount: Type.Integer(),
      budgetsAvailable: Type.Boolean(),
    },),
    Type.Null(),
  ],),
});

/**
 *
 */
export type AdminFederationUsage = Static<typeof AdminFederationUsage>;

/** GET /api/v1/admin/federation/matrix — `{ matrix: { preferences } }`. */
export const AdminFederationMatrix = Type.Object({
  matrix: Type.Object({ preferences: Type.Record(Type.String(), Type.Array(Type.String(),),), },),
});

/**
 *
 */
export type AdminFederationMatrix = Static<typeof AdminFederationMatrix>;

/** POST /api/v1/admin/federation/peers — probe verdict plus the stored peer. */
export const AdminFederationPeerSave = Type.Object({
  peer: AdminFederationPeer,
  probe: Type.Object({
    outcome: Type.String(),
    reason: Type.String(),
  },),
});

/**
 *
 */
export type AdminFederationPeerSave = Static<typeof AdminFederationPeerSave>;