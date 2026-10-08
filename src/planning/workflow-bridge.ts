// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Workflow → Planning bridge.
 *
 * Best-effort sync of workflow steps to plan items. Called alongside
 * the pure workflow runner (startWorkflow / buildStep) by the orchestrator.
 * Never throws — db failures are swallowed to avoid breaking workflows.
 */
import type { Kysely, } from "kysely";
import type { WorkflowRun, } from "../assistant/workflow-runner";
import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import { PlanItemKind, PlanItemState, } from "../db/enums-story/plans";
import type { DB, } from "../db/schema";
import { createPlanningService, } from "./service";

/**
 * Sync workflow steps to plan items.
 * Creates missing items (todo) and advances filled steps (doing).
 * @param db
 * @param workflow
 * @param run
 * @param ownerId
 */
export async function emitWorkflowPlanSteps(
  db: Kysely<DB>,
  workflow: AssistantWorkflowConfig,
  run: WorkflowRun,
  ownerId: string,
): Promise<void> {
  try {
    const service = createPlanningService(db,);
    const chatId = `workflow:${workflow.id}`;
    const existing = await service.list(ownerId, chatId,);
    const byTitle: Record<string, string> = {};
    for (const item of existing) {
      byTitle[item.title] = item.id;
    }

    for (const [position, step,] of workflow.steps.entries()) {
      const hasValue = run.values[step.id] !== undefined;
      const existingId = byTitle[step.name];

      if (!existingId) {
        await service.create({
          owner_id: ownerId,
          chat_id: chatId,
          title: step.name,
          kind: PlanItemKind.Step,
          position,
        },);
      } else if (hasValue) {
        const item = await service.get(existingId,);
        if (item && item.state === PlanItemState.Todo) {
          await service.advance(existingId, PlanItemState.Doing,);
        }
      }
    }
  } catch {
    // Best-effort: never break workflow on db failure
  }
}
