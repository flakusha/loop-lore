// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AUX Pipeline — Prompt-Eval CLI (`bun run eval:prompts`)
 *
 * Runs the fixture corpus against the deterministic mock provider by
 * default; routes through a real OpenAI-compatible endpoint only when
 * `AUX_EVAL_BASE_URL` is set (optional `AUX_EVAL_API_KEY`, `AUX_EVAL_MODEL`).
 *
 * Exit codes: 0 = no regression vs baseline, 1 = accuracy drop or parse-null
 * increase on any task, 2 = harness error.
 * `--update-baseline` rewrites baseline.json from the current run.
 */
import { flag, object, runScript, withDefault, } from "../../cli/parser";
import { createLogger, getLogger, } from "../../logger";
import { asError, safeJsonStringify, } from "../../utils";
import { EVAL_CORPUS, } from "./corpus";
import { createEvalEnv, } from "./env";
import { runPromptEval, } from "./runner";
import { type Baseline, diffBaseline, reportMetrics, type TaskReport, } from "./score";

const BASELINE_URL = new URL("./baseline.json", import.meta.url,);

const parser = object({
  updateBaseline: withDefault(flag("--update-baseline",), false,),
},);

/** Read the stored baseline; missing file ⇒ empty (first run seeds it). */
async function readBaseline(): Promise<Baseline> {
  const file = Bun.file(BASELINE_URL,);
  if (!(await file.exists())) { return {}; }
  return await file.json() as Baseline;
}

/**
 * Format the per-task report table.
 * @param reports
 */
function formatReportLines(reports: readonly TaskReport[],): string[] {
  return reports.map((r,) => {
    const m = reportMetrics(r,);
    return `${r.task}: accuracy=${(m.accuracy * 100).toFixed(1,)}% (${r.correct}/${r.total}) parseNull=${
      (m.parseNullRate * 100).toFixed(1,)
    }%`;
  },);
}

/** @returns the eval transport selected from the environment. */
function resolveMode(): Parameters<typeof createEvalEnv>[0] {
  const baseUrl = process.env.AUX_EVAL_BASE_URL;
  if (!baseUrl) { return { transport: "mock", }; }
  return {
    transport: "endpoint",
    baseUrl,
    model: process.env.AUX_EVAL_MODEL ?? "default",
    apiKey: process.env.AUX_EVAL_API_KEY,
  };
}

/** CLI entry point. @throws never — failures map to exit codes. */
async function main(): Promise<void> {
  createLogger({ level: "info", },);
  const log = getLogger().child({ module: "eval:prompts", },);
  const { updateBaseline, } = runScript(parser, {
    programName: "eval:prompts",
    brief: "Run the prompt-eval fixture corpus against the deterministic mock provider.",
    help: "option",
  },);

  let env;
  try {
    env = await createEvalEnv(resolveMode(), EVAL_CORPUS,);
    const reports = await runPromptEval(env, EVAL_CORPUS,);
    for (const line of formatReportLines(reports,)) {
      log.info(line,);
      // Sync echo: the async log queue's flush is not reliable on process
      // exit (batch timer), and the report IS the CLI's contract.
      process.stdout.write(`${line}\n`,);
    }

    if (updateBaseline) {
      const baseline = Object.fromEntries(reports.map((r,) => [r.task, reportMetrics(r,),]),);
      const serialized = safeJsonStringify(baseline,);
      await Bun.write(BASELINE_URL, `${serialized.ok ? serialized.value : "{}"}\n`,);
      log.info("baseline updated",);
      return;
    }

    const regressions = diffBaseline(reports, await readBaseline(),);
    for (const r of regressions) {
      log.info(`REGRESSION ${r.task}: ${r.kind} baseline=${r.baseline} current=${r.current}`,);
    }

    if (regressions.length > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    log.error("eval harness failed", asError(error,),);
    process.exitCode = 2;
  } finally {
    env?.close();
    // The async log queue batches on a 100ms timer — flush before the
    // process exits or the report never reaches stdout/stderr.
    await getLogger().flush();
  }
}

await main();
