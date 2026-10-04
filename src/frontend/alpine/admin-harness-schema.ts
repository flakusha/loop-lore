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
 * them as closed unions: `deserializeRun` does `w.task_type ?? "other"` with
 * no union check, so a legacy line carrying `"WEIRD_RESULT"` reaches the API
 * verbatim. A `Type.Union` of literals here would reject the entire runs
 * response over one odd historical row, turning a cosmetic anomaly into a
 * blank table. The unknown value renders fine - `failed` is a `!== "ok"`
 * comparison, so an unrecognised result is simply counted as a failure.
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
