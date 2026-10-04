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
import { Type, } from "@sinclair/typebox";

/** One row of `GET /api/v1/harness/runs`. */
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
  branch: Type.String(),
  gitSha: Type.String(),
  pid: Type.Number(),
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
