// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GET /api/v1/admin/honkbox/status — read-only view of the cached honkbox
 * capability/queue probe. Mounted on the v1 admin surface; no config writes,
 * no provider registration, no probe URL or credential in the response.
 *
 * The endpoint reuses the existing Custom-provider `baseUrl` field: either a
 * `generation.providers.openaiCompatible` entry named `honkbox` or an
 * operator-stored provider descriptor of the same name. No new config
 * namespace is introduced.
 */
import { type Context, Elysia, t, } from "elysia";
import { getConfigValue, } from "../../admin/config";
import {
  listServerProviders,
  serverProviderSecretKey,
} from "../../generation/providers/server-provider-store";
import {
  getHonkboxCapabilities,
  type HonkboxProbeResult,
  isHonkboxExternalToolAvailable,
  isHonkboxFeatureEnabled,
} from "../../integrations/honkbox/capabilities";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, withPermissionAuth, } from "../http-utils";
import type { AdminRouteOpts, } from "./types";

/** Provider instance name that carries the honkbox endpoint. */
const HONKBOX_PROVIDER_NAME = "honkbox";

/** Auth fields populated by the global derive; tests inject the same shape. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/** Non-secret endpoint used for the probe. */
export interface HonkboxEndpoint {
  readonly baseUrl: string;
  readonly apiKey?: string;
}

/** Test seams; production uses the provider config and cached probe. */
export interface HonkboxStatusRouteOpts extends AdminRouteOpts {
  /** Resolve the configured endpoint. Omitted means read config + DB. */
  readonly resolveEndpoint?: () => Promise<HonkboxEndpoint | undefined>;
  /** Probe capabilities. Omitted means the shared cached probe. */
  readonly probe?: (endpoint: HonkboxEndpoint,) => Promise<HonkboxProbeResult>;
}

/** Sanitized status projection — no raw URL, credential or probe detail. */
interface HonkboxStatusView {
  readonly configured: boolean;
  readonly state: "unavailable" | "degraded" | "available";
  readonly availability: boolean;
  readonly reason: string | null;
  readonly gpuSlots: number | null;
  readonly queueWaitSecs: number | null;
  readonly retryAfterSecs: number | null;
  readonly jobsEnabled: boolean;
  readonly eventsEnabled: boolean;
  readonly toolsEnabled: boolean;
  readonly externalTools: readonly { readonly id: string; readonly available: boolean }[];
  readonly cached: boolean;
}

const HonkboxStatusResponse = t.Object({
  configured: t.Boolean(),
  state: t.Union([
    t.Literal("unavailable",),
    t.Literal("degraded",),
    t.Literal("available",),
  ],),
  availability: t.Boolean(),
  reason: t.Union([t.String(), t.Null(),],),
  gpuSlots: t.Union([t.Integer(), t.Null(),],),
  queueWaitSecs: t.Union([t.Integer(), t.Null(),],),
  retryAfterSecs: t.Union([t.Integer(), t.Null(),],),
  jobsEnabled: t.Boolean(),
  eventsEnabled: t.Boolean(),
  toolsEnabled: t.Boolean(),
  externalTools: t.Array(t.Object({
    id: t.String(),
    available: t.Boolean(),
  },),),
  cached: t.Boolean(),
},);

/**
 * Build the explicit unavailable state; never throws and never carries probe
 * detail, which could include the endpoint URL.
 * @param configured - whether an endpoint was found
 * @param reason - short non-secret reason code
 * @returns the unavailable projection
 */
function unavailableStatus(configured: boolean, reason: string,): HonkboxStatusView {
  return {
    configured,
    state: "unavailable",
    availability: false,
    reason,
    gpuSlots: null,
    queueWaitSecs: null,
    retryAfterSecs: null,
    jobsEnabled: false,
    eventsEnabled: false,
    toolsEnabled: false,
    externalTools: [],
    cached: false,
  };
}

/**
 * Resolve the honkbox endpoint from file config, then the stored provider.
 * @param opts - shared admin route options
 * @returns the endpoint, or undefined when none is configured
 */
async function resolveEndpoint(opts: AdminRouteOpts,): Promise<HonkboxEndpoint | undefined> {
  const fromFile = opts.config.generation?.providers?.openaiCompatible?.find(
    (provider,) => provider.name === HONKBOX_PROVIDER_NAME,
  );

  if (fromFile?.baseUrl) {
    return {
      baseUrl: fromFile.baseUrl,
      ...(fromFile.apiKey ? { apiKey: fromFile.apiKey, } : {}),
    };
  }

  const stored = (await listServerProviders(opts.database,)).find(
    (provider,) => provider.name === HONKBOX_PROVIDER_NAME,
  );

  if (!stored?.baseUrl) { return undefined; }
  const apiKey = await getConfigValue(opts.database, serverProviderSecretKey(HONKBOX_PROVIDER_NAME,),);
  return {
    baseUrl: stored.baseUrl,
    ...(apiKey ? { apiKey, } : {}),
  };
}

/**
 * Read the current capability/queue state, failing closed to `unavailable`.
 * @param opts - route options with optional test seams
 * @returns the sanitized projection
 */
async function readStatus(opts: HonkboxStatusRouteOpts,): Promise<HonkboxStatusView> {
  let endpoint: HonkboxEndpoint | undefined;
  try {
    endpoint = await (opts.resolveEndpoint ?? (() => resolveEndpoint(opts,)))();
  } catch {
    return unavailableStatus(false, "config-unavailable",);
  }

  if (!endpoint?.baseUrl?.trim()) {
    return unavailableStatus(false, "not-configured",);
  }

  let probe: HonkboxProbeResult;
  try {
    probe = await (opts.probe ?? ((target,) => getHonkboxCapabilities(target,)))(endpoint,);
  } catch {
    return unavailableStatus(true, "probe-failed",);
  }

  if (!probe.ok) { return unavailableStatus(true, probe.reason,); }
  if (!probe.supported) {
    return { ...unavailableStatus(true, probe.warning ?? "unsupported-contract",), state: "degraded", };
  }

  const { queue, externalTools, } = probe.capabilities;
  return {
    configured: true,
    state: "available",
    availability: true,
    reason: null,
    gpuSlots: queue.gpuSlots,
    queueWaitSecs: queue.queueWaitSecs,
    retryAfterSecs: queue.retryAfterSecs,
    jobsEnabled: isHonkboxFeatureEnabled(probe, "jobs",),
    eventsEnabled: isHonkboxFeatureEnabled(probe, "events",),
    toolsEnabled: isHonkboxFeatureEnabled(probe, "tools",),
    externalTools: (externalTools?.tools ?? []).map((tool,) => ({
      id: tool.id,
      available: isHonkboxExternalToolAvailable(probe, tool.id,),
    })),
    cached: probe.cached === true,
  };
}

/**
 * Read-only honkbox admin status plugin.
 * @param opts - shared admin options plus optional test seams
 * @param prefix - mount prefix; the v1 surface passes "/api/v1"
 * @returns the Elysia plugin
 */
export function honkboxStatusRoutes(opts: HonkboxStatusRouteOpts, prefix = "/api/v1",) {
  return new Elysia({ name: "admin-honkbox-status", },)
    .get(`${prefix}/admin/honkbox/status`, async (ctx,) => {
      const result = await withPermissionAuth(ctx as unknown as Ctx, "admin.system", () => readStatus(opts,),);
      return result instanceof Response ? result : jsonResponse(result,);
    }, {
      detail: {
        summary: "Read honkbox capability and queue status",
        description: "Reports the cached honkbox capability probe: availability, GPU slots, queue wait, " +
          "retry-after, feature flags and external-tool availability. Read-only; no secrets or probe URL.",
        tags: ["Admin", "Integrations",],
      },
      response: { 200: HonkboxStatusResponse, 403: ErrorResponse, },
    },);
}
