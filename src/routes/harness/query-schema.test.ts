// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Unit tests for the harness query schemas: the task-type and result unions
 * are the closed vocabularies the runs route filters on — a value outside
 * them is a client error, never a silently dropped filter — and the run-id
 * params are the shared shape both run routes read.
 */
import { Value, } from "@sinclair/typebox/value";
import { describe, expect, it, } from "bun:test";
import { HARNESS_RESULTS, HARNESS_TASK_TYPES, } from "../../harness/types";
import { resultSchema, runIdParams, taskTypeSchema, } from "./query-schema";

describe("harness query schemas", () => {
  it("accepts every task type the shared union names", () => {
    for (const taskType of HARNESS_TASK_TYPES) {
      expect(Value.Check(taskTypeSchema, taskType,),).toBe(true,);
    }
  });

  it("rejects a task type outside the union instead of dropping the filter", () => {
    expect(Value.Check(taskTypeSchema, "bogus",),).toBe(false,);
    expect(Value.Check(taskTypeSchema, "harnesscode",),).toBe(false,);
    expect(Value.Check(taskTypeSchema, "",),).toBe(false,);
  });

  it("accepts every result the shared union names", () => {
    for (const result of HARNESS_RESULTS) {
      expect(Value.Check(resultSchema, result,),).toBe(true,);
    }
  });

  it("rejects a result outside the union", () => {
    expect(Value.Check(resultSchema, "OK",),).toBe(false,);
    expect(Value.Check(resultSchema, "weird",),).toBe(false,);
    expect(Value.Check(resultSchema, "",),).toBe(false,);
  });

  it("requires a string run id", () => {
    expect(Value.Check(runIdParams, { runId: "run-1", },),).toBe(true,);
    expect(Value.Check(runIdParams, {},),).toBe(false,);
    expect(Value.Check(runIdParams, { runId: 7, },),).toBe(false,);
  });
});
