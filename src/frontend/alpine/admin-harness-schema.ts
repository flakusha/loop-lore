// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wire shapes for the read-only harness endpoints (`/api/v1/harness/*`).
 *
 * These live beside the component rather than in `src/validation/schemas/`
 * because `src/routes/harness/**` owns the server half of the contract. The
 * admin tab decodes the same shape with `parseOr`, so a contract drift shows
 * up as "unexpected shape" instead of an untyped cast.
 */
import { type Static, Type, } from "@sinclair/typebox";

/**
 * One row of `GET /api/v1/harness/runs`.
 *
 * `branch`, `gitSha` and `pid` are nullable, not string/number: they are the
 * git provenance a run records, and a run logged outside a checkout (or a
 * hand-written / legacy JSONL line) has none. `HarnessRunSummary` declares
 * them `string | null` / `number | null` and the server passes the nulls
 * straight through, so a non-nullable schema here made `parseOr` reject the
 * WHOLE response for a run with no branch - the admin tab then rendered an
 * "unexpected shape" error instead of the row.
 *
 * `taskType` and `result` stay `Type.String()` even though the server types
 * them as closed unions: `deserializeRun` coerces both, so an unknown
 * `task_type` becomes `"other"` and an unknown `result` becomes `"error"`
 * before the row ever reaches the API. A `Type.Union` of literals here would
 * reject the entire runs response over one odd historical row, turning a
 * cosmetic anomaly into a blank table. The coerced value renders fine -
 * `failed` is a `!== "ok"` comparison, so an unrecognised result is simply
 * counted as a failure.
 */
export const HarnessRunSummarySchema = Type.Object({
  runId: Type.String(),
  ts: Type.String(),
  durationMs: Type.Number(),
  task: Type.String(),
  taskType: Type.String(),
  model: Type.String(),
  toolCount: Type.Number(),
  result: Type.String(),
  error: Type.Union([Type.String(), Type.Null(),],),
  costUsd: Type.Number(),
  tokensIn: Type.Number(),
  tokensOut: Type.Number(),
  // Git provenance, absent when the run had no checkout to read it from.
  branch: Type.Union([Type.String(), Type.Null(),],),
  gitSha: Type.Union([Type.String(), Type.Null(),],),
  pid: Type.Union([Type.Number(), Type.Null(),],),
  // Turn correlation id; null on every line written before turns were
  // correlated, and on paths with no turn in scope (an initial greeting).
  turnId: Type.Union([Type.String(), Type.Null(),],),
},);

/**
 * `GET /api/v1/harness/runs/:runId` — the summary plus the activity fields.
 *
 * Composed from {@link HarnessRunSummarySchema} rather than restated, so the
 * two endpoints cannot drift on a shared field: the detail endpoint returns
 * `durationMs` (not the persisted `runMs`) and a non-null `costUsd` (not the
 * record's null), and pinning it to the summary schema is what keeps that true.
 */
export const HarnessRunDetailSchema = Type.Composite([
  HarnessRunSummarySchema,
  Type.Object({
    tools: Type.Array(Type.String(),),
    pattern: Type.String(),
    // A string, not a nullable: the record field is `""` when there is no
    // detail, so this is never null on the wire.
    patternDetail: Type.String(),
    toolingGap: Type.Union([Type.String(), Type.Null(),],),
    msg: Type.Union([Type.String(), Type.Null(),],),
  },),
],);

/** `GET /api/v1/harness/runs` body. */
export const HarnessRunsResponse = Type.Object({
  items: Type.Array(HarnessRunSummarySchema,),
},);

/** One listed sandbox entry (`GET /api/v1/harness/runs/:runId/files`). */
export const HarnessSandboxEntrySchema = Type.Object({
  name: Type.String({},),
  /** Repo-relative path from the sandbox root, `/`-separated. */
  path: Type.String({},),
  type: Type.Union([Type.Literal("file",), Type.Literal("dir",),],),
  size: Type.Number({},),
  mtimeMs: Type.Number({},),
},);

/** `GET /api/v1/harness/runs/:runId/files` body (read-only tree, one level). */
export const HarnessSandboxFilesSchema = Type.Object({
  /** Repo-relative sandbox root, so the client can build editor links. */
  root: Type.String({},),
  /** The listed subdirectory, `""` for the root. */
  path: Type.String({},),
  entries: Type.Array(HarnessSandboxEntrySchema,),
},);

/**
 * The listing, nullable — `parseOr` needs a fallback of the schema's own
 * static type, and "no tree loaded" is exactly the state after a bad
 * response, so the nullability lives in the schema instead of a cast.
 */
export const HarnessSandboxFilesNullable = Type.Union([HarnessSandboxFilesSchema, Type.Null(),],);

/**
 * The detail record, nullable — `parseOr` needs a fallback of the schema's own
 * static type, and "no detail loaded" is exactly the state after a bad
 * response, so the nullability lives in the schema instead of a cast.
 */
export const HarnessRunDetailNullable = Type.Union([HarnessRunDetailSchema, Type.Null(),],);

/**
 * The numeric rollup counters every grouping shares, declared once because
 * `byModel`, `byTaskType`, `byPattern` and `totals` all carry the same subset
 * and repeating the field lists inline was a jscpd clone.
 */

/** runs + failures: the pair on every grouping. */
const runsFailures = { runs: Type.Number(), failures: Type.Number(), } as const;
/** The latency average, which only the wider rollups report. */
const avgMs = { avgMs: Type.Number(), } as const;
/** The money/token fields, model rollup and totals only. */
const usage = { costUsd: Type.Number(), tokensIn: Type.Number(), tokensOut: Type.Number(), } as const;

const HarnessByModelSchema = Type.Object({
  model: Type.String(),
  ...runsFailures,
  ...avgMs,
  ...usage,
},);

const HarnessByTaskTypeSchema = Type.Object({
  taskType: Type.String(),
  ...runsFailures,
  ...avgMs,
},);

const HarnessByPatternSchema = Type.Object({
  pattern: Type.String(),
  ...runsFailures,
},);

const HarnessToolingGapSchema = Type.Object({
  toolingGap: Type.String(),
  count: Type.Number(),
},);

/** `GET /api/v1/harness/stats` body. */
export const HarnessStatsSchema = Type.Object({
  totals: Type.Object({
    ...runsFailures,
    ...usage,
    ...avgMs,
  },),
  byModel: Type.Array(HarnessByModelSchema,),
  byTaskType: Type.Array(HarnessByTaskTypeSchema,),
  byPattern: Type.Array(HarnessByPatternSchema,),
  toolingGaps: Type.Array(HarnessToolingGapSchema,),
},);

/**
 * Binary availability of one harness profile (TASK-optional-dep-packaging):
 * a discriminated verdict — the binary's `--version` first line when
 * spawnable, otherwise why the configured command cannot start. Probed
 * lazily against the admin-configured argv only; never at module load.
 */
export const HarnessAvailabilitySchema = Type.Union([
  Type.Object({
    available: Type.Literal(true,),
    /** First line of the binary's `--version` output; null when it printed none. */
    version: Type.Union([Type.String(), Type.Null(),],),
  },),
  Type.Object({
    available: Type.Literal(false,),
    /** Why the configured command cannot be spawned (not found / spawn error). */
    reason: Type.String({},),
  },),
],);

/** Static view of {@link HarnessAvailabilitySchema} for typed row shaping. */
export type HarnessAvailabilityView = Static<typeof HarnessAvailabilitySchema>;

/**
 * One configured profile of `GET /api/v1/harness/settings`, decorated with
 * the static provider ToS matrix (`integrations/harness/provider-tos.ts`):
 * usage classes, subscription flag and the localized note key travel on the
 * wire so the panel renders the matrix without importing server modules.
 */
export const HarnessProfileSettingsSchema = Type.Object({
  name: Type.String(),
  /** `harness` flavor, defaulted to `"omp"` when the profile omitted it. */
  flavor: Type.String(),
  usageClasses: Type.Array(Type.String(),),
  subscriptionBacked: Type.Boolean(),
  /** Locale key (`harness.tos.note.*`) of the provider ToS note. */
  noteKey: Type.String(),
  tosGrayzoneAcknowledged: Type.Boolean(),
  /** Binary availability verdict for the profile's configured command. */
  availability: HarnessAvailabilitySchema,
},);

/** `GET /api/v1/harness/settings` body (also the PUT response shape). */
export const HarnessSettingsResponse = Type.Object({
  enabled: Type.Boolean(),
  profiles: Type.Array(HarnessProfileSettingsSchema,),
},);

/** Static view of {@link HarnessSettingsResponse} for typed row shaping. */
export type HarnessSettingsView = Static<typeof HarnessSettingsResponse>;

/**
 * The settings payload, nullable — `parseOr` needs a fallback of the schema's
 * own static type, and "no settings loaded" is exactly the state after a bad
 * response, so the nullability lives in the schema instead of a cast.
 */
export const HarnessSettingsNullable = Type.Union([HarnessSettingsResponse, Type.Null(),],);

/**
 * One permission ask parked for human approval
 * (`GET /api/v1/harness/permissions`). `input` is the harness's raw
 * `session/request_permission` params — pass-through, deliberately untyped.
 */
export const HarnessPendingPermissionSchema = Type.Object({
  id: Type.String({},),
  profile: Type.String({},),
  tool: Type.Union([Type.String({},), Type.Null(),],),
  input: Type.Unknown(),
  cwd: Type.String({},),
  arrival: Type.Number({},),
},);

/** `GET /api/v1/harness/permissions` body (FIFO order, oldest first). */
export const HarnessPermissionsResponse = Type.Object({
  items: Type.Array(HarnessPendingPermissionSchema,),
},);

/** `POST /api/v1/harness/permissions/:id/approve|deny` body. */
export const HarnessPermissionDecisionResponse = Type.Object({
  ok: Type.Boolean({},),
},);

/** Static view of {@link HarnessPendingPermissionSchema} for typed shaping. */
export type HarnessPendingPermission = Static<typeof HarnessPendingPermissionSchema>;

/** Static view of {@link HarnessPermissionsResponse}. */
export type HarnessPermissionsView = Static<typeof HarnessPermissionsResponse>;

/**
 * Capability facts merged onto a discovered model from the static
 * capability table (`src/admin/model-capabilities.ts`); null on the entry
 * when the table does not know the model.
 */
export const HarnessModelCapabilitiesSchema = Type.Object({
  contextWindow: Type.Union([Type.Number({},), Type.Null(),],),
  maxOutput: Type.Union([Type.Number({},), Type.Null(),],),
  supportsTools: Type.Boolean({},),
  supportsVision: Type.Boolean({},),
  supportsThinking: Type.Boolean({},),
  modalities: Type.Array(Type.String({},),),
},);

/**
 * One model discovered for a harness profile
 * (`GET /api/v1/harness/models`). `source` discriminates harness-verified
 * ids (a live connection's listing) from static fallbacks (configured tier
 * models); `reason` explains a static fallback and is absent on
 * harness-reported entries.
 */
export const HarnessDiscoveredModelSchema = Type.Object({
  profile: Type.String({},),
  harness: Type.String({},),
  model: Type.String({},),
  source: Type.Union([Type.Literal("harness",), Type.Literal("static",),],),
  reason: Type.Optional(Type.String({},),),
  capabilities: Type.Union([HarnessModelCapabilitiesSchema, Type.Null(),],),
},);

/** `GET /api/v1/harness/models` body (profiles in preference order). */
export const HarnessModelsResponse = Type.Object({
  items: Type.Array(HarnessDiscoveredModelSchema,),
},);
