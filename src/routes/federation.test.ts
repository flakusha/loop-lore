// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for federation discovery + instance-state endpoints.
 *
 * All routes are opt-in via `config.federation.enabled` (default false). When
 * disabled, all federation routes return 404. When enabled, NodeInfo 2.1,
 * well-known discovery, and instance-state are served with no secret leakage.
 */
import { describe, expect, test, } from "bun:test";
import { APP_NAME, APP_VERSION, } from "../config/constants";
import type { Config, FederationConfig, } from "../config/schema";
import { federationRoutes, } from "./federation";

function configWith(federation: Partial<FederationConfig>,): Config {
  const fed: FederationConfig = {
    enabled: federation.enabled ?? false,
    seeds: federation.seeds ?? [],
    peers: federation.peers ?? [],
  };
  return {
    server: { host: "localhost", port: 3000, tls: undefined, },
    auth: { registrationOpen: false, },
    federation: fed,
  } as unknown as Config;
}

const FED_ENABLED = configWith({ enabled: true, },);
const FED_DISABLED = configWith({ enabled: false, },);

describe("federationRoutes — gating", () => {
  test("disabled: /.well-known/nodeinfo returns 404", async () => {
    const app = federationRoutes({ config: FED_DISABLED, },);
    const res = await app.handle(new Request("http://localhost/.well-known/nodeinfo",),);
    expect(res.status,).toBe(404,);
  });

  test("disabled: /nodeinfo/2.1 returns 404", async () => {
    const app = federationRoutes({ config: FED_DISABLED, },);
    const res = await app.handle(new Request("http://localhost/nodeinfo/2.1",),);
    expect(res.status,).toBe(404,);
  });

  test("disabled: /api/instance-state returns 404", async () => {
    const app = federationRoutes({ config: FED_DISABLED, },);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    expect(res.status,).toBe(404,);
  });
});

describe("federationRoutes — NodeInfo 2.1", () => {
  test("/.well-known/nodeinfo links to the NodeInfo document", async () => {
    const app = federationRoutes({ config: FED_ENABLED, },);
    const res = await app.handle(new Request("http://localhost/.well-known/nodeinfo",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { links: { rel: string; href: string }[] };
    expect(body.links.length,).toBe(1,);
    const link = body.links[0] ?? { rel: "", href: "", };
    expect(link.rel,).toBe("http://nodeinfo.diaspora.software/ns/schema/2.1",);
    expect(link.href,).toContain("/nodeinfo/2.1",);
  });

  test("/nodeinfo/2.1 returns valid NodeInfo 2.1 document", async () => {
    const app = federationRoutes({ config: FED_ENABLED, },);
    const res = await app.handle(new Request("http://localhost/nodeinfo/2.1",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version,).toBe("2.1",);
    const software = body.software as { name: string; version: string };
    expect(software.name,).toBe(APP_NAME,);
    expect(software.version,).toBe(APP_VERSION,);
    expect(Array.isArray(body.protocols,),).toBe(true,);
    expect((body.protocols as string[]).includes("activitypub",),).toBe(true,);
    expect(body.openRegistrations,).toBe(false,);
  });

  test("/nodeinfo/2.1 does not leak user counts", async () => {
    const app = federationRoutes({ config: FED_ENABLED, },);
    const res = await app.handle(new Request("http://localhost/nodeinfo/2.1",),);
    const body = (await res.json()) as { usage: { users: unknown } };
    expect(body.usage.users,).toEqual({},);
  });
});

describe("federationRoutes — instance-state", () => {
  test("/api/instance-state returns versioned instance-state", async () => {
    const app = federationRoutes({ config: FED_ENABLED, },);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.version,).toBe(1,);
    expect(typeof body.instanceId,).toBe("string",);
    const software = body.software as { name: string; version: string };
    expect(software.name,).toBe(APP_NAME,);
    expect(software.version,).toBe(APP_VERSION,);
    expect(Array.isArray(body.protocols,),).toBe(true,);
    expect(typeof body.uptime,).toBe("number",);
    expect(["ok", "degraded",].includes(body.state as string,),).toBe(true,);
  });

  test("/api/instance-state does not leak secrets or user identifiers", async () => {
    const app = federationRoutes({ config: FED_ENABLED, },);
    const res = await app.handle(new Request("http://localhost/api/instance-state",),);
    const body = await res.text();
    expect(body,).not.toMatch(/apiKey|password|secret|token|userId|sessionId/i,);
  });
});
