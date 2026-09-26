// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Workflow run sessions (epic-assistant-creative-studio-workflows).
//
// In-memory, per-chat runs of the workflow-runner state machine. One active
// run per chat: a trigger message starts it, plain messages fill the next
// unfilled step in order, `/workflow confirm` dispatches, `/workflow cancel`
// aborts. Sessions are ephemeral — a restart drops them (runs are
// prompt-building UX, not persisted work). Callers own persistence of the
// dispatch result.

import type { AssistantWorkflowConfig, } from "../config/sections/templates";
import { startWorkflow, type WorkflowRun, } from "./workflow-runner";

/** One active run: template + mutable progress */
export interface WorkflowSession {
  workflow: AssistantWorkflowConfig;
  run: WorkflowRun;
}

/** Chat id -> active session */
const sessions: Record<string, WorkflowSession> = {};

/**
 * Start (or replace) the active run for a chat.
 * @param chatId - Chat owning the session
 * @param workflow - Resolved workflow template
 * @returns The new session
 */
export function startSession(chatId: string, workflow: AssistantWorkflowConfig,): WorkflowSession {
  const session: WorkflowSession = { workflow, run: startWorkflow(workflow,), };
  sessions[chatId] = session;
  return session;
}

/**
 * Get the active session for a chat, if any.
 * @param chatId - Chat to look up
 * @returns The session, or undefined when no run is active
 */
export function getSession(chatId: string,): WorkflowSession | undefined {
  return sessions[chatId];
}

/**
 * Drop the active session for a chat.
 * @param chatId - Chat to clear
 * @returns True when a session was active
 */
export function cancelSession(chatId: string,): boolean {
  if (sessions[chatId] === undefined) { return false; }
  delete sessions[chatId];
  return true;
}

/**
 * Ids of unfilled required steps, in template order. Optional steps
 * (`required === false`) never appear — they are auto-skipped at fill and
 * confirm time, mirroring confirmAndDispatch in workflow-runner.ts.
 * @param session - Active session
 * @returns Missing step ids; empty when the run is ready to dispatch
 */
export function missingStepIds(session: WorkflowSession,): string[] {
  return session.workflow.steps
    .filter((step,) => step.required !== false && session.run.values[step.id] === undefined)
    .map((step,) => step.id);
}

/**
 * Next unfilled required step id for a session, in template order.
 * Optional steps (`required === false`) are auto-skipped — plain messages
 * are never offered to them and they never block dispatch.
 * @param session - Active session
 * @returns Step id, or undefined when all required steps are filled
 */
export function nextStepId(session: WorkflowSession,): string | undefined {
  return missingStepIds(session,)[0];
}

/**
 * Place a session into the store (rehydration from persistence).
 * Overwrites any active run for the chat.
 * @param chatId - Chat owning the session
 * @param session - Session to restore
 */
export function restoreSession(chatId: string, session: WorkflowSession,): void {
  sessions[chatId] = session;
}

/** Clear all sessions (tests only). */
export function clearSessions(): void {
  for (const key of Object.keys(sessions,)) { delete sessions[key]; }
}
