// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec-log read API + admin harness settings read/write.
 *
 * Runs/stats/files endpoints are admin-only: the log carries branch names,
 * error text and process ids, so it is not public data. The log itself is
 * append-only from inside the process (`harness/exec-log.ts`), never by
 * HTTP. `/harness/settings` is the admin settings surface — read side is
 * the store view; the write side persists the enable flag and per-profile
 * ToS greyzone acknowledgements through the existing config save path
 * (`saveHarnessAdminSettings` → `system_config`, round-tripped through
 * `validateAcpProfiles`).
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import {
  type HarnessAvailabilityView,
  HarnessRunDetailSchema,
  HarnessRunsResponse,
  HarnessSandboxFilesSchema,
  HarnessSettingsResponse,
  type HarnessSettingsView,
  HarnessStatsSchema,
} from "../../frontend/alpine/admin-harness-schema";
import { getRun, listRuns, stats, } from "../../harness/query";
import type { HarnessResult, HarnessTaskType, } from "../../harness/types";
import { HARNESS_RESULTS, HARNESS_TASK_TYPES, toDetail, toSummary, } from "../../harness/types";
import {
  getHarnessAdminFileConfig,
  getHarnessAdminSettings,
  type HarnessProfileSettingsView,
  saveHarnessAdminSettings,
} from "../../integrations/harness/admin-settings";
import { probeHarnessCommand, } from "../../integrations/harness/availability";
import { HARNESS_PROVIDER_TOS, providerTosInfo, } from "../../integrations/harness/provider-tos";
import { getChildLogger, } from "../../logger";
import { requirePermission, } from "../../middleware/permissions";
import { asError, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { ErrorCode, HttpStatus, type HttpStatusCode, jsonError, jsonResponse, } from "../http-utils";
import { harnessRunFiles, type SandboxFilesError, } from "./files";
import { resultSchema, runIdParams, taskTypeSchema, } from "./query-schema";

/**
 * Narrow a validated query value to the closed `HarnessTaskType` union.
 * @param value - the `?taskType=` query value, already validated by the schema
 * @returns the matching task type, or undefined when it is absent.
 */
function asTaskType(value: unknown,): HarnessTaskType | undefined {
  if (typeof value !== "string") { return undefined; }
  // The exported list is the source of truth for the union; a second copy here
  // is a membership check that silently rots the day a task type is added.
  return HARNESS_TASK_TYPES.find((k,) => k === value);
}

/**
 * Narrow a validated query value to the closed `HarnessResult` union.
 * @param value - the `?result=` query value, already validated by the schema
 * @returns the matching result, or undefined when it is absent.
 */
function asResult(value: unknown,): HarnessResult | undefined {
  if (typeof value !== "string") { return undefined; }
  return HARNESS_RESULTS.find((k,) => k === value);
}

/**
 * HTTP status for each listing refusal. `escape` is a bad request (the client
 * asked for something outside the sandbox), missing runs/sandboxes/dirs are
 * not found, and an `io` failure is a server-side problem.
 * @param refusal - the listing refusal.
 * @returns the matching HTTP status.
 */
function filesErrorStatus(refusal: SandboxFilesError,): HttpStatusCode {
  switch (refusal.kind) {
    case "escape":
      return HttpStatus.BadRequest;
    case "no-run":
    case "no-sandbox":
    case "not-found":
      return HttpStatus.NotFound;
    case "io":
      return HttpStatus.InternalServerError;
  }
}

/**
 * Build the harness route plugin.
 * @param opts - injected database handle (the settings write path persists
 *   through `system_config`, like every other admin surface plugin).
 * @param prefix - Mount prefix. Admin-gated like the rest of the admin
 *   surface, so the default is the versioned root.
 * @returns The Elysia plugin, ready for `.use()`.
 */
export function harnessRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api/v1",) {
  const guard = requirePermission("admin.system",);
  // The 200 bodies are the schemas the web client already decodes with, imported
  // from there so the declared output and the `parseOr` input cannot drift. That
  // module is a leaf (it imports nothing but typebox), so this edge cannot cycle
  // back into the server.
  const denied = { 403: ErrorResponse, } as const;
  return new Elysia({ name: "harness", },)
    .guard({ beforeHandle: guard, }, (app,) =>
      app
        .get(`${prefix}/harness/runs`, async (ctx,) => {
          const q = ctx.query as Record<string, string | undefined>;
          const limit = Number.parseInt(q.limit ?? "", 10,);
          const items = await listRuns(
            { taskType: asTaskType(q.taskType,), result: asResult(q.result,), },
            Number.isFinite(limit,) ? limit : undefined,
          );

          return jsonResponse({ items: items.map(toSummary,), },);
        }, {
          query: t.Object({
            limit: t.Optional(t.String({},),),
            taskType: t.Optional(taskTypeSchema,),
            result: t.Optional(resultSchema,),
          },),
          response: { 200: HarnessRunsResponse, ...denied, },
        },)
        .get(`${prefix}/harness/runs/:runId`, async (ctx,) => {
          const { runId, } = ctx.params as { runId: string };
          const record = await getRun(runId,);
          if (record === null) {
            return jsonError({
              message: `Harness run "${runId}" not found`,
              status: HttpStatus.NotFound,
              code: ErrorCode.NotFound,
            },);
          }

          return jsonResponse(toDetail(record,),);
        }, {
          params: runIdParams,
          response: { 200: HarnessRunDetailSchema, ...denied, },
        },)
        .get(`${prefix}/harness/runs/:runId/files`, async (ctx,) => {
          const { runId, } = ctx.params as { runId: string };
          const q = ctx.query as Record<string, string | undefined>;
          const listed = await harnessRunFiles({
            runId,
            relPath: q.path ?? "",
            // The server runs from the repo root; worktree sandboxes live under
            // `tree/<branch>` relative to it (giwt layout).
            repoRoot: process.cwd(),
            getRun,
          },);

          if ("kind" in listed) {
            return jsonError({
              message: `Sandbox listing refused (${listed.kind},)`,
              status: filesErrorStatus(listed,),
              code: listed.kind === "escape"
                ? ErrorCode.BadRequest
                : listed.kind === "io"
                ? ErrorCode.ServerError
                : ErrorCode.NotFound,
            },);
          }

          return jsonResponse(listed,);
        }, {
          params: runIdParams,
          query: t.Object({ path: t.Optional(t.String({},),), },),
          response: { 200: HarnessSandboxFilesSchema, ...denied, },
        },)
        .get(`${prefix}/harness/stats`, async () => jsonResponse(await stats(),), {
          response: { 200: HarnessStatsSchema, ...denied, },
        },)
        .get(`${prefix}/harness/settings`, async (ctx,) => {
          const q = ctx.query as Record<string, string | undefined>;

          try {
            return jsonResponse(await settingsWithAvailability(q.refresh === "1",),);
          } catch (error) {
            // A configured profile whose `harness` flavor the provider-ToS
            // matrix does not know is a SERVER-side config defect: the config
            // validator only checks flavors while `harness.acp.enabled` is
            // true, so a typo'd flavor in a disabled config survives to the
            // decoration step. The throw used to escape the handler and
            // answer a plain-text 500; it now answers the error envelope and
            // names only the offending flavor. The real cause is logged.
            getChildLogger("routes.harness",)?.error("Harness settings read failed", asError(error,),);
            const flavor = unknownFlavor();

            return jsonError({
              message: flavor === undefined
                ? "Harness settings could not be read"
                : `Harness profile flavor "${flavor}" is not a known provider flavor`,
              status: HttpStatus.InternalServerError,
              code: ErrorCode.ServerError,
            },);
          }
        }, {
          query: t.Object({ refresh: t.Optional(t.String({},),), },),
          // The 500 is declared because the handler can answer it: an
          // unknown provider flavor is a server-side config defect. The
          // generated OpenAPI spec reads this map, so an undeclared 500
          // would ship a spec that under-documents the endpoint.
          response: { 200: HarnessSettingsResponse, ...denied, 500: ErrorResponse, },
        },)
        .put(`${prefix}/harness/settings`, async (ctx,) => {
          const body = ctx.body as {
            enabled?: boolean;
            acknowledgements?: Record<string, boolean>;
          };

          try {
            await saveHarnessAdminSettings(database, {
              enabled: body.enabled,
              acknowledgements: body.acknowledgements,
            },);

            return jsonResponse(await settingsWithAvailability(false,),);
          } catch (error) {
            // The save path validates before persisting (unknown profile,
            // non-boolean ack, non-serializable value) — a rejected patch is
            // a client error and nothing was written.
            return jsonError({
              message: String(error,),
              status: HttpStatus.BadRequest,
              code: ErrorCode.BadRequest,
            },);
          }
        }, {
          body: t.Object({
            enabled: t.Optional(t.Boolean({},),),
            acknowledgements: t.Optional(t.Record(t.String(), t.Boolean(),),),
          },),
          response: { 200: HarnessSettingsResponse, ...denied, },
        },),);
}

/**
 * Decorate one configured profile with the static provider ToS matrix from
 * `provider-tos.ts` — the admin panel renders usage class + note per flavor
 * straight off the wire, so the matrix stays the single in-code source.
 * @param p - the store's profile view
 * @returns the wire shape the panel decodes (HarnessSettingsResponse item).
 */
function decorateProfile(p: HarnessProfileSettingsView,): {
  name: string;
  flavor: string;
  usageClasses: string[];
  subscriptionBacked: boolean;
  noteKey: string;
  tosGrayzoneAcknowledged: boolean;
} {
  const tos = providerTosInfo(p.flavor,);
  return {
    name: p.name,
    flavor: p.flavor,
    usageClasses: [...tos.usageClasses,],
    subscriptionBacked: tos.subscriptionBacked,
    noteKey: tos.noteKey,
    tosGrayzoneAcknowledged: p.tosGrayzoneAcknowledged,
  };
}

/**
 * The configured profile flavor the provider-ToS matrix does not know.
 *
 * The matrix is the same table `providerTosInfo` reads, so this names the
 * flavor that made the decoration throw without a second list of flavors to
 * keep in sync.
 * @returns the offending flavor, or undefined when every flavor is known.
 */
function unknownFlavor(): string | undefined {
  const bad = getHarnessAdminSettings().profiles.find((p,) => !Object.hasOwn(HARNESS_PROVIDER_TOS, p.flavor,));

  return bad?.flavor;
}

/**
 * Probe one profile's binary availability (TASK-optional-dep-packaging).
 * The probed argv comes from the admin-owned file config only — the same
 * invariant as the isolation gate's allowlist: caller input never becomes a
 * spawn argv. Lazy and cached per process; `refresh` re-runs the probe.
 * @param name - the profile's loop-lore-local name
 * @param refresh - bypass the probe cache when true
 * @returns the wire availability verdict.
 */
async function availabilityForProfile(name: string, refresh: boolean,): Promise<HarnessAvailabilityView> {
  const profile = getHarnessAdminFileConfig().profiles.find((p,) => p.name === name);
  if (profile === undefined) {
    return { available: false, reason: "profile not present in harness.acp config", };
  }

  const verdict = await probeHarnessCommand({ command: profile.command, refresh, },);
  return verdict.available
    ? { available: true, version: verdict.version, }
    : { available: false, reason: verdict.reason, };
}

/**
 * Shape the effective settings view into the wire body, probing every
 * configured profile's binary availability sequentially (the profile list is
 * tiny, and verdicts are cached after the first hit).
 * @param refresh - bypass the probe cache when true
 * @returns the `GET`/`PUT /harness/settings` response body.
 */
async function settingsWithAvailability(refresh: boolean,): Promise<HarnessSettingsView> {
  const view = getHarnessAdminSettings();

  const profiles: HarnessSettingsView["profiles"] = [];

  for (const p of view.profiles) {
    profiles.push({ ...decorateProfile(p,), availability: await availabilityForProfile(p.name, refresh,), },);
  }

  return { enabled: view.enabled, profiles, };
}
