// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the classification-task registry: completeness over the
 * `AuxTaskName` union, single-source role preference, and call overrides.
 *
 * Resource contract: fully in-memory and parallel-safe — no DB, no files,
 * no ports, no mutated module state or global stubs.
 */
import { describe, expect, test, } from "bun:test";
import { LLM_PROMPT_DEFAULTS, } from "../prompts/registry";
import { AUX_CLASSIFICATION_TASKS, defineClassificationTask, } from "./template-registry";
import type { AuxTaskName, } from "./types";

/** Tasks that historically preferred the classifier role (old CLASSIFIER_TASKS). */
const LEGACY_CLASSIFIER_TASKS: readonly AuxTaskName[] = [
  "intent",
  "injection-check",
  "transition",
  "message-action",
  "gm-tool",
  "moderation",
  "nsfw",
];

describe("AUX_CLASSIFICATION_TASKS", () => {
  test("covers every AuxTaskName exactly", () => {
    // The Record type already enforces this at compile time; the runtime
    // assert pins the union size so accidental key drops surface here too.
    expect(Object.keys(AUX_CLASSIFICATION_TASKS,).sort(),).toEqual(
      [
        "adapt",
        "carriage",
        "chat-title",
        "gm-tool",
        "injection-check",
        "intent",
        "memory",
        "message-action",
        "moderation",
        "nsfw",
        "prompt-analysis",
        "prompt-improve",
        "rag-ask",
        "transition",
      ].sort(),
    );
  });

  test("each def echoes its key and carries sane call overrides", () => {
    for (const [task, def,] of Object.entries(AUX_CLASSIFICATION_TASKS,)) {
      expect(def.task, `${task} task mismatch`,).toBe(task as AuxTaskName,);
      expect(Array.isArray(def.labels,), `${task} labels`,).toBe(true,);
      // Overrides are optional — undefined defers to the runner defaults.
      if (def.call.timeoutMs !== undefined) {
        expect(def.call.timeoutMs, `${task} timeoutMs`,).toBeGreaterThan(0,);
      }

      if (def.call.temperature !== undefined) {
        expect(def.call.temperature, `${task} temperature`,).toBeGreaterThanOrEqual(0,);
      }

      if (def.call.maxTokens !== undefined) {
        expect(def.call.maxTokens, `${task} maxTokens`,).toBeGreaterThan(0,);
      }
    }
  });

  test("preferClassifier matches the former CLASSIFIER_TASKS set", () => {
    for (const [task, def,] of Object.entries(AUX_CLASSIFICATION_TASKS,)) {
      expect(def.preferClassifier, task,).toBe(LEGACY_CLASSIFIER_TASKS.includes(task as AuxTaskName,),);
    }
  });

  test("purposes resolve through LLM_PROMPT_DEFAULTS", () => {
    for (const [task, def,] of Object.entries(AUX_CLASSIFICATION_TASKS,)) {
      if (def.purpose === null) { continue; }
      expect(LLM_PROMPT_DEFAULTS[def.purpose], `${task} → ${def.purpose} default`,).toBeTruthy();
    }
  });

  test("null purposes are exactly the factory-built / dead slots", () => {
    const nullPurpose = Object.entries(AUX_CLASSIFICATION_TASKS,)
      .filter(([, def,],) => def.purpose === null)
      .map(([task,],) => task)
      .sort();

    expect(nullPurpose,).toEqual(["adapt", "message-action", "prompt-improve",],);
  });
});

describe("defineClassificationTask", () => {
  test("returns the descriptor unchanged", () => {
    const def = defineClassificationTask({
      task: "intent",
      purpose: "intent",
      labels: ["greeting",],
      preferClassifier: true,
      call: { maxTokens: 100, },
    },);

    expect(def.task,).toBe("intent",);
    expect(def.call.maxTokens,).toBe(100,);
  });
});
