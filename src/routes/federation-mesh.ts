// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/federation-mesh.ts — mesh content-sharing routes.
//
// Receiver side: `/api/mesh-reserve` (capacity reservation + inbound
// content-key issuance over sealed wires) and `/api/mesh-deliver`
// (envelope decrypt, hash-verify, LWW store). Mounted by `federationRoutes`
// only when `config.federation.enabled`. No secrets leak: the content key
// travels only in the reserve response over a sealed wire.
import type { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import { getSmk, } from "../crypto/smk";
import type { Db, } from "../db";
import { createMeshClock, } from "../federation/clock";
import {
  type DeliveryVerdict,
  receiveDelivery,
} from "../federation/delivery";
import { createMeshEncryption, } from "../federation/encryption";
import { type ContentEnvelope, } from "../federation/envelope";
import { canonicalOrigin, } from "../federation/peer-fetch";
import { getOrCreateInboundKey, } from "../federation/peer-keys";
import {
  assertTrustedPeer,
  createInboundReservation,
} from "../federation/sharing";
import { ErrorCode, HttpStatus, jsonError, jsonResponse, } from "./http-utils";

export interface MeshRouteOpts {
  config: Config;
  database: Db;
}

/**
 * Mount the mesh reserve/deliver routes on a federation app.
 * @param app Elysia app under construction.
 * @param opts Server config + database.
 * @returns {void}
 */
export function mountMeshApi(app: Elysia, opts: MeshRouteOpts,): void {
  const { config, } = opts;
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

      if (typeof request?.reservationId !== "string") {
        return jsonError({
          message: "reservationId is required",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const reservationId = request.reservationId;

      const senderOrigin = canonicalOrigin(envelope.origin,);
      if (senderOrigin === null) {
        return jsonError({
          message: "invalid envelope origin",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const trusted = await assertTrustedPeer(opts.database, senderOrigin,);
      if (!trusted) {
        return jsonError({
          message: "untrusted peer",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      const ciphers = await createMeshEncryption(secret,).receiverCiphers(
        opts.database,
        envelope.origin,
        getSmk(),
      );

      let verdict: DeliveryVerdict | null = null;
      for (const cipher of ciphers) {
        try {
          verdict = await receiveDelivery(
            opts.database,
            envelope as ContentEnvelope,
            cipher,
            { reservationId, },
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

  app.post(
    "/api/mesh-retract",
    async ({ body, },) => {
      const request = body as { contentId?: unknown; origin?: unknown } | null;
      if (!request || typeof request.contentId !== "string" || typeof request.origin !== "string") {
        return jsonError({
          message: "contentId and origin are required",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const canonical = canonicalOrigin(request.origin,);
      if (canonical === null) {
        return jsonError({
          message: "invalid origin",
          status: HttpStatus.BadRequest,
          code: ErrorCode.BadRequest,
        },);
      }

      const trusted = await assertTrustedPeer(opts.database, canonical,);
      if (!trusted) {
        return jsonError({
          message: "untrusted peer",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      const delivery = await opts.database
        .selectFrom("mesh_deliveries",)
        .select(["origin",],)
        .where("content_id", "=", request.contentId,)
        .executeTakeFirst();

      if (!delivery) {
        return jsonError({
          message: "content not found",
          status: HttpStatus.NotFound,
          code: ErrorCode.NotFound,
        },);
      }

      const deliveryOrigin = canonicalOrigin(delivery.origin,);
      if (deliveryOrigin !== canonical) {
        return jsonError({
          message: "origin mismatch",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      // Scope the DELETE to the origin that was just authorized. Filtering on
      // the STORED `delivery.origin` (not the canonical form) is what makes the
      // write provably hit only the authorized row: a concurrent
      // `receiveDelivery` upsert that overwrites `origin` in the read-then-write
      // window makes the predicate miss, and a miss is reported as 403 rather
      // than a retraction that never happened (IDOR).
      const deleted = await opts.database
        .deleteFrom("mesh_deliveries",)
        .where("content_id", "=", request.contentId,)
        .where("origin", "=", delivery.origin,)
        .executeTakeFirst();

      if (Number(deleted?.numDeletedRows ?? 0n,) === 0) {
        return jsonError({
          message: "origin mismatch",
          status: HttpStatus.Forbidden,
          code: ErrorCode.Forbidden,
        },);
      }

      return jsonResponse({ ok: true, },);
    },
    {
      detail: {
        summary: "Retract mesh content delivery",
        description:
          "Deletes a previously delivered content envelope by content id. Only the originating trusted peer may retract.",
        tags: ["Federation",],
      },
    },
  );
}
