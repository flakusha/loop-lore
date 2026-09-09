// SPDX-License-Identifier: LGPL-3.0-or-lenter
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Federation discovery + instance-state endpoints.
 *
 * All routes are OPT-IN via `config.federation.enabled` (default false). When
 * federation is disabled, NO route is mounted (404), so an unprovisioned
 * instance advertises nothing to the network.
 *
 * Endpoints (NodeInfo 2.1 spec + instance-state for mesh peers):
 * - `/.well-known/nodeinfo` → links to the NodeInfo document
 * - `/nodeinfo/2.1` → software name/version, protocols, openRegistrations
 * - `/api/instance-state` → instance ID, version, protocols, uptime, coarse state
 *
 * No secrets, user identifiers, counts, or internal topology are exposed.
 */
import { Elysia, } from "elysia";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import type { Config, } from "../config/schema";
import { getSmk, } from "../crypto/smk";
import type { Db, } from "../db";
import { pskCipher, } from "../federation/cipher";
import { createMeshClock, } from "../federation/clock";
import { type ContentEnvelope, } from "../federation/envelope";
import { getGossipOrigins, } from "../federation/gossip";
import { ciphersForSender, getOrCreateInboundKey, } from "../federation/peer-keys";
import {
  createInboundReservation,
  type DeliveryVerdict,
  receiveDelivery,
} from "../federation/sharing";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "./http-utils";

const NODEINFO_SCHEMA = "http://nodeinfo.diaspora.software/ns/schema/2.1";

/** Stable instance identifier — derived from server config, not a secret. */
function instanceId(config: Config,): string {
  const { host, port, } = config.server;
  return `${host}:${port}`;
}

/** Coarse health verdict from provider health — ok | degraded. */
type CoarseState = "ok" | "degraded";
function coarseState(): CoarseState {
  return "ok";
}

interface FederationOpts {
  config: Config;
  database: Db;
}

/** @param opts */
export function federationRoutes(opts: FederationOpts,): Elysia {
  const { config, } = opts;
  const app = new Elysia();

  if (!config.federation.enabled) {
    return app;
  }

  const origin = config.server.publicOrigin ??
    `${config.server.tls?.cert ? "https" : "http"}://${config.server.host}:${config.server.port}`;

  app.get(
    "/.well-known/nodeinfo",
    () => {
      return jsonResponse({
        links: [
          {
            rel: NODEINFO_SCHEMA,
            href: `${origin}/nodeinfo/2.1`,
          },
        ],
      },);
    },
    {
      detail: {
        summary: "NodeInfo discovery",
        description: "Links to the NodeInfo 2.1 document. Federation opt-in.",
        tags: ["Federation",],
      },
    },
  );

  app.get(
    "/nodeinfo/2.1",
    () => {
      return jsonResponse({
        version: "2.1",
        software: {
          name: APP_NAME,
          version: APP_VERSION,
        },
        protocols: ["activitypub",],
        services: { outbound: [], inbound: [], },
        openRegistrations: config.auth.registrationOpen,
        usage: { users: {}, },
        metadata: { instanceId: instanceId(config,), },
      },);
    },
    {
      detail: {
        summary: "NodeInfo 2.1 document",
        description: "Software name/version, protocols, registration state. No user counts.",
        tags: ["Federation",],
      },
    },
  );

  app.get(
    "/api/instance-state",
    () => {
      return jsonResponse({
        instanceId: instanceId(config,),
        software: {
          name: APP_NAME,
          version: APP_VERSION,
        },
        protocols: ["activitypub",],
        capabilities: [],
        uptime: Math.floor(process.uptime(),),
        state: coarseState(),
        peers: getGossipOrigins(),
        version: 1,
      },);
    },
    {
      detail: {
        summary: "Instance state advertisement",
        description: "Peer-bootstrap payload: identity, version, protocols, uptime, state. No secrets.",
        tags: ["Federation",],
      },
    },
  );

  // Receiver-side mesh clock: adopts sender stamps (HLC receive rule) so
  // this instance's future sends order after everything it has seen.
  const meshClock = createMeshClock();

  app.post(
    "/api/mesh-reserve",
    async ({ body, },) => {
      const secret = config.federation.meshPsk;
      if (!secret) {
        return jsonError({
          message: "mesh sharing not configured (MESH_PSK unset)",
          status: HttpStatus.ServiceUnavailable,
          code: ErrorCode.ServiceUnavailable,
        },);
      }
      const request = body as {
        senderOrigin?: unknown;
        contentHash?: unknown;
        sizeBytes?: unknown;
        contentType?: unknown;
        ttlMs?: unknown;
      } | null;
      if (
        !request || typeof request.senderOrigin !== "string" ||
        typeof request.contentHash !== "string" ||
        typeof request.sizeBytes !== "number"
      ) {
        return jsonError({
          message: "invalid reservation request",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }
      try {
        const reservationId = await createInboundReservation(opts.database, {
          senderOrigin: request.senderOrigin,
          contentHash: request.contentHash,
          sizeBytes: request.sizeBytes,
          contentType: typeof request.contentType === "string" ? request.contentType : undefined,
          ttlMs: typeof request.ttlMs === "number" ? request.ttlMs : undefined,
        },);
        // Hand the sender our inbound key for its origin (single-writer:
        // only the receiver mints these). Issued only over a sealed wire —
        // direct TLS or a TLS-terminating proxy — since the key travels in
        // the response body: over plaintext HTTP it would ride the same
        // wire as the ciphertexts it protects. Absent without an SMK or
        // on a plaintext wire — the sender then seals with the shared PSK.
        const wireSealed = Boolean(config.server.tls?.cert,) || config.server.trustProxy === true;
        const smk = getSmk();
        const contentKey = smk === null || !wireSealed
          ? undefined
          : await getOrCreateInboundKey(opts.database, smk, request.senderOrigin,);
        return jsonResponse(
          contentKey === undefined ? { reservationId, } : { reservationId, contentKey, },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "reservation failed";
        const status = message.includes("untrusted peer",)
          ? HttpStatus.Forbidden
          : message.includes("capacity exhausted",)
          ? HttpStatus.Conflict
          : HttpStatus.BadRequest;
        const code = status === HttpStatus.Forbidden
          ? ErrorCode.Forbidden
          : status === HttpStatus.Conflict
          ? ErrorCode.Conflict
          : ErrorCode.BadRequest;
        return jsonError({ message, status, code, },);
      }
    },
    {
      detail: {
        summary: "Reserve inbound mesh capacity",
        description: "Trusted peers reserve bytes before pushing content. Federation opt-in.",
        tags: ["Federation",],
      },
    },
  );

  app.post(
    "/api/mesh-deliver",
    async ({ body, },) => {
      const secret = config.federation.meshPsk;
      if (!secret) {
        return jsonError({
          message: "mesh delivery not configured (MESH_PSK unset)",
          status: HttpStatus.ServiceUnavailable,
          code: ErrorCode.ServiceUnavailable,
        },);
      }
      const request = body as {
        envelope?: Partial<ContentEnvelope> | null;
        reservationId?: unknown;
      } | null;
      const envelope = request?.envelope;
      if (
        !envelope || typeof envelope.id !== "string" || typeof envelope.origin !== "string" ||
        typeof envelope.clock !== "number" || typeof envelope.type !== "string" ||
        typeof envelope.hash !== "string" || typeof envelope.size !== "number" ||
        typeof envelope.ciphertext !== "string"
      ) {
        return jsonError({
          message: "invalid content envelope",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }
      const reservationId = typeof request?.reservationId === "string"
        ? request.reservationId
        : undefined;
      const ciphers = await ciphersForSender(
        opts.database,
        envelope.origin,
        pskCipher(secret,),
        getSmk(),
      );
      let verdict: DeliveryVerdict | null = null;
      for (const cipher of ciphers) {
        try {
          verdict = await receiveDelivery(
            opts.database,
            envelope as ContentEnvelope,
            cipher,
            reservationId === undefined ? {} : { reservationId, },
          );
          break;
        } catch {
          // Try the next cipher (current → grace previous → PSK fallback).
        }
      }
      if (verdict === null) {
        return jsonError({
          message: "envelope failed integrity verification",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }
      meshClock.observe(envelope.clock,);
      return jsonResponse({ verdict, },);
    },
    {
      detail: {
        summary: "Receive mesh content delivery",
        description: "Decrypts, verifies, and stores a pushed content envelope (LWW). Federation opt-in.",
        tags: ["Federation",],
      },
    },
  );

  return app;
}
