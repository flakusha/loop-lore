// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Peer CRUD for the federation admin panel.
 *
 * Validation is delegated wholesale to `validatePeerWorkloadSave` so the route
 * and the registry store can never disagree about what a valid peer is: a
 * non-http(s) origin, a loopback origin without a token, a token on a remote
 * origin, a class outside the enum and a duplicate origin are ALL rejected by
 * the shared validator, not re-implemented here.
 *
 * The shared token is WRITE-ONLY. It is accepted on save, handed straight to
 * `savePeerWorkload` for encryption, and never placed in a response, an audit
 * `meta` blob, or a log line. `WorkloadPeer` exposes only `hasSharedToken`.
 *
 * A save runs a live probe: a peer that cannot answer `/api/instance-state` is
 * stored `pending`, never `trusted`, and the operator is told why.
 */

import { Elysia, t, } from "elysia";
import { PEER_INSTANCE_KINDS, PEER_WORKLOAD_CLASSES, } from "../../db/enums";
import { setPeerState, } from "../../federation/coordinator";
import { revokeDekExportsForPeer, } from "../../federation/dek-rewrap";
import { canonicalOrigin, } from "../../federation/peer-fetch";
import { type PeerProbeFetch, probePeerHealth, } from "../../federation/peer-health-probe";
import { revokeInboundKey, } from "../../federation/peer-keys";
import {
  listWorkloadPeers,
  PeerWorkloadValidationError,
  savePeerWorkload,
  setAllowedWorkloadClasses,
  setWorkloadTrust,
} from "../../federation/peer-registry";
import { getChildLogger, } from "../../logger";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import {
  AdminFederationPeerBody,
  AdminFederationWorkloadBody,
} from "../../validation/schemas/admin-federation";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, withPermissionAuth, } from "../http-utils";
import {
  auditFederationChange,
  federationOffResponse,
  isInstanceKind,
  isWorkloadClass,
  notInEnumResponse,
} from "./federation-shared";
import type { AdminFederationRouteOpts, } from "./federation-types";

/** A malformed origin, refused before anything is stored or probed. */
function badOriginResponse(): Response {
  return jsonError({
    message: "origin must be an http(s) URL",
    status: HttpStatus.BadRequest,
    code: ErrorCode.BadRequest,
  },);
}

/** Per-peer CA/SPKI trust overrides for the probe, from `config.federation.peers`. */
function configTrustFor(opts: AdminFederationRouteOpts, origin: string,) {
  return opts.config.federation.peers.find((peer,) => canonicalOrigin(peer.origin,) === origin);
}

/** Validate + save one peer, mapping every rejection onto a 400. */
async function savePeer(
  opts: AdminFederationRouteOpts,
  actorId: string,
  body: {
    origin: string;
    displayName?: string | null;
    instanceKind?: string;
    authMode?: string;
    workloadTrust?: boolean;
    allowedWorkloadClasses?: string[];
    stickyEnabled?: boolean;
    sharedToken?: string | null;
  },
): Promise<Response> {
  const origin = canonicalOrigin(body.origin,);
  if (origin === null) { return badOriginResponse(); }

  // A shared token is encrypted at rest with the BYOK key. With no key
  // configured there is nothing trustworthy to encrypt it under, so the save is
  // refused outright rather than storing a token under an empty secret.
  if (body.sharedToken != null && body.sharedToken.trim() !== "" && opts.encryptionKey === "") {
    return jsonError({
      message: "byoKey.encryptionKey must be configured before a peer shared token can be stored",
      status: HttpStatus.BadRequest,
      code: ErrorCode.BadRequest,
      data: { reason: "missing_encryption_key", },
    },);
  }

  const kind = body.instanceKind ?? "general";
  if (!isInstanceKind(kind,)) { return notInEnumResponse("instanceKind", kind, PEER_INSTANCE_KINDS,); }

  for (const entry of body.allowedWorkloadClasses ?? []) {
    if (!isWorkloadClass(entry,)) { return notInEnumResponse("allowedWorkloadClasses", entry, PEER_WORKLOAD_CLASSES,); }
  }

  const trust = configTrustFor(opts, origin,);
  const probe = await probePeerHealth({
    origin,
    ...(trust?.trust === undefined ? {} : { trust: trust.trust, }),
    ...(opts.probeFetch === undefined ? {} : { fetchImpl: opts.probeFetch as PeerProbeFetch, }),
  },);

  let peer;
  try {
    peer = await savePeerWorkload(opts.database, {
      origin,
      displayName: body.displayName ?? null,
      instanceKind: kind,
      workloadTrust: body.workloadTrust === true,
      allowedWorkloadClasses: (body.allowedWorkloadClasses ?? []).filter(isWorkloadClass,),
      stickyEnabled: body.stickyEnabled === true,
      sharedToken: body.sharedToken ?? null,
      encryptionKey: opts.encryptionKey,
    },);
  } catch (error) {
    if (error instanceof PeerWorkloadValidationError) {
      return jsonError({
        message: error.message,
        status: HttpStatus.BadRequest,
        code: ErrorCode.BadRequest,
        data: { reason: error.reason, },
      },);
    }

    throw error;
  }

  // A peer is trusted ONLY once it has answered its own advertisement. An
  // unreachable peer stays pending so no workload can be routed to it.
  const state = probe.outcome === "reachable" ? "trusted" : "pending";
  if (state === "trusted") { await setPeerState(opts.database, peer.origin, "trusted",); }

  await auditFederationChange({
    database: opts.database,
    actorId,
    eventType: "federation.peer_saved",
    action: "peer_save",
    entityType: "mesh_peer",
    entityId: peer.origin,
    message: `Peer saved: ${peer.origin} (probe ${probe.outcome})`,
    meta: {
      origin: peer.origin,
      probeOutcome: probe.outcome,
      linkKind: peer.linkKind,
      workloadTrust: peer.workloadTrust,
      allowedWorkloadClasses: peer.allowedWorkloadClasses,
      hasSharedToken: peer.hasSharedToken,
    },
  },);

  getChildLogger("admin-federation",)?.info("peer saved", { origin: peer.origin, probe: probe.outcome, },);
  return jsonResponse({ peer: { ...peer, state, }, probe, },);
}

/**
 * Peer CRUD endpoints. Every route gates on the EXISTING `admin.system`
 * permission — this epic deliberately adds no `federation.*` string.
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function federationPeersRoutes(opts: AdminFederationRouteOpts, prefix = "/api",) {
  const db = opts.database;
  return new Elysia({ name: "admin-federation-peers", },)
    .get(`${prefix}/admin/federation/peers`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async () => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        return jsonResponse({ peers: await listWorkloadPeers(db,), },);
      },);
    }, { response: { 200: t.Any(), 403: ErrorResponse, 503: ErrorResponse, }, },)
    .post(`${prefix}/admin/federation/peers`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        return await savePeer(opts, actorId, ctx.body,);
      },);
    }, {
      body: AdminFederationPeerBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 403: ErrorResponse, 503: ErrorResponse, },
    },)
    .patch(`${prefix}/admin/federation/peers/:origin/workload`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        const origin = canonicalOrigin(ctx.params.origin,);
        if (origin === null) { return badOriginResponse(); }

        if ((await listWorkloadPeers(db,)).every((peer,) => peer.origin !== origin)) {
          return jsonError({
            message: `unknown peer: ${origin}`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        for (const entry of ctx.body.allowedWorkloadClasses ?? []) {
          if (!isWorkloadClass(entry,)) {
            return notInEnumResponse("allowedWorkloadClasses", entry, PEER_WORKLOAD_CLASSES,);
          }
        }

        try {
          if (ctx.body.workloadTrust !== undefined) {
            await setWorkloadTrust(db, { origin, workloadTrust: ctx.body.workloadTrust, },);
          }

          if (ctx.body.allowedWorkloadClasses !== undefined) {
            await setAllowedWorkloadClasses(db, {
              origin,
              classes: ctx.body.allowedWorkloadClasses.filter(isWorkloadClass,),
            },);
          }

          if (ctx.body.stickyEnabled !== undefined) {
            await db.updateTable("mesh_peers",).set({ sticky_enabled: ctx.body.stickyEnabled, },).where(
              "origin",
              "=",
              origin,
            ).execute();
          }
        } catch (error) {
          if (error instanceof PeerWorkloadValidationError) {
            return jsonError({
              message: error.message,
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
              data: { reason: error.reason, },
            },);
          }

          throw error;
        }

        const peer = (await listWorkloadPeers(db,)).find((entry,) => entry.origin === origin);
        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.peer_workload_updated",
          action: "peer_workload_update",
          entityType: "mesh_peer",
          entityId: origin,
          message: `Peer workload policy updated: ${origin}`,
          meta: { origin, workloadTrust: peer?.workloadTrust, allowedWorkloadClasses: peer?.allowedWorkloadClasses, },
        },);

        return jsonResponse({ peer, },);
      },);
    }, {
      body: AdminFederationWorkloadBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        503: ErrorResponse,
      },
    },)
    .delete(`${prefix}/admin/federation/peers/:origin`, async (ctx: any,) => {
      return withPermissionAuth(ctx, "admin.system", async (actorId,) => {
        const off = federationOffResponse(opts.federationEnabled,);
        if (off !== null) { return off; }
        const origin = canonicalOrigin(ctx.params.origin,);
        if (origin === null) { return badOriginResponse(); }

        if ((await listWorkloadPeers(db,)).every((peer,) => peer.origin !== origin)) {
          return jsonError({
            message: `unknown peer: ${origin}`,
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        // Revocations first and idempotent: a half-deleted peer that kept its
        // inbound key could still be handed content by a sender that holds it.
        await revokeInboundKey(db, origin,);
        const revokedDekExports = await revokeDekExportsForPeer(db, origin,);
        await db.deleteFrom("mesh_peers",).where("origin", "=", origin,).execute();

        await auditFederationChange({
          database: db,
          actorId,
          eventType: "federation.peer_removed",
          action: "peer_remove",
          entityType: "mesh_peer",
          entityId: origin,
          message: `Peer removed: ${origin}`,
          meta: { origin, revokedDekExports, },
        },);

        return jsonResponse({ ok: true, origin, revokedDekExports, },);
      },);
    }, {
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
        503: ErrorResponse,
      },
    },);
}
