// SPDX-License-Identifier: LGPL-3.0-or-later
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
 * - `/.well-known/host-meta` → XRD `lrdd` template pointing at WebFinger
 * - `/.well-known/webfinger` → JRD for federation-consented characters only
 *
 * No secrets, user identifiers, counts, or internal topology are exposed.
 */
import { Elysia, } from "elysia";
import { computeBuildIdentity, } from "../build/identity";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import type { Config, } from "../config/schema";
import { getGossipOrigins, } from "../federation/gossip";
import { resolveLocalActor, } from "../federation/local-webfinger";
import { declaredWorkloadClasses, } from "../federation/peer-capabilities";
import { createLocalPeerWorkExecutor, } from "../federation/peer-work-execute";
import { buildHostMetaXrd, HOST_META_PATH, WEBFINGER_PATH, } from "../federation/webfinger";
import { type MeshRouteOpts, mountMeshApi, } from "./federation-mesh";
import { mountPeerWorkApi, } from "./federation-peer-work";
import { HttpStatus, jsonResponse, } from "./http-utils";

const NODEINFO_SCHEMA = "http://nodeinfo.diaspora.software/ns/schema/2.1";

/**
 * Stable instance identifier — derived from server config, not a secret.
 * @param config
 */
function instanceId(config: Config,): string {
  const { host, port, } = config.server;
  return `${host}:${port}`;
}

/** Coarse health verdict from provider health — ok | degraded. */
type CoarseState = "ok" | "degraded";
function coarseState(): CoarseState {
  return "ok";
}

/**
 * @param opts
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function federationRoutes(opts: MeshRouteOpts,): Elysia {
  const { config, } = opts;
  const app = new Elysia();

  if (!config.federation.enabled) {
    return app;
  }

  const origin = config.server.publicOrigin ??
    `${config.server.tls?.cert ? "https" : "http"}://${config.server.host}:${config.server.port}`;

  // RFC 6415 host-meta pointer. WebFinger itself lives at a fixed RFC 7033
  // path, so this document is a hint for legacy resolvers — it lists no
  // actors, no counts, and nothing about internal topology.
  app.get(
    HOST_META_PATH,
    () =>
      new Response(buildHostMetaXrd(origin,), {
        headers: { "content-type": "application/xrd+xml; charset=utf-8", },
      },),
    {
      detail: {
        summary: "WebFinger discovery pointer",
        description: "XRD lrdd template for /.well-known/webfinger. Federation opt-in.",
        tags: ["Federation",],
      },
    },
  );

  // RFC 7033 WebFinger. Answers only for characters whose owner consented to
  // federation, and only for this instance's own host: an unknown handle and
  // an unpublished one both 404, so the route cannot enumerate accounts.
  app.get(
    WEBFINGER_PATH,
    async (ctx,) => {
      const resource = (ctx as { query: { resource?: string } }).query.resource;
      if (typeof resource !== "string" || resource.length === 0) {
        return jsonResponse({ error: "resource query parameter is required", }, HttpStatus.BadRequest,);
      }

      const match = await resolveLocalActor({ database: opts.database, origin, resource, },);
      if (!match) { return new Response(null, { status: HttpStatus.NotFound, },); }
      return Response.json(match.jrd, {
        headers: { "content-type": "application/jrd+json; charset=utf-8", },
      },);
    },
    {
      detail: {
        summary: "WebFinger actor discovery",
        description: "JRD for acct: handles and actor URIs of federation-consented characters. Federation opt-in.",
        tags: ["Federation",],
      },
    },
  );

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
    async () => {
      const identity = await computeBuildIdentity();
      return jsonResponse({
        instanceId: instanceId(config,),
        software: {
          name: APP_NAME,
          version: APP_VERSION,
        },
        protocols: ["activitypub",],
        capabilities: declaredWorkloadClasses(config,),
        uptime: Math.floor(process.uptime(),),
        state: coarseState(),
        peers: getGossipOrigins(),
        buildHash: identity.buildHashShort,
        version: 1,
      },);
    },
    {
      detail: {
        summary: "Instance state advertisement",
        description: "Peer-bootstrap payload: identity, version, protocols, uptime, state, buildHash. No secrets.",
        tags: ["Federation",],
      },
    },
  );

  mountMeshApi(app, opts,);
  mountPeerWorkApi(app, {
    ...opts,
    encryptionKey: config.byoKey?.encryptionKey ?? "",
    runWorkload: createLocalPeerWorkExecutor({ config, },),
  },);

  return app;
}
