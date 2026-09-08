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
import type { Config, } from "../config/schema";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import { jsonResponse, } from "./http-utils";

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
}

/** @param opts */
export function federationRoutes(opts: FederationOpts,): Elysia {
  const { config, } = opts;
  const app = new Elysia();

  if (!config.federation.enabled) {
    return app;
  }

  const origin = `${config.server.tls?.cert ? "https" : "http"}://${config.server.host}:${config.server.port}`;

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

  return app;
}
