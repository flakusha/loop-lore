// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/cron/dag/nodes.ts — Per-node execution state
 *
 * The state machine half of the DAG, split from the pass loop in
 * ./engine.ts. The engine owns the graph and decides what runs; this
 * owns what each node's last run did to it.
 *
 * State is process-local and deliberately not persisted — see the note
 * in ./engine.ts. It is mutable by design: the pass updates it in place
 * as nodes settle, and `statusMap` reads the same records back.
 */

import type { TaskNodeState, TaskNodeStatus, } from "./types";

/** States a node does not re-enter within a pass, so the loop never
 *  re-dispatches completed or abandoned work. `failed` is terminal for
 *  the pass: a node re-runs only via `reset`, or on a later pass once
 *  its `retry` prerequisites clear.
 */
export const SETTLED: Record<TaskNodeState, boolean> = {
  blocked: false,
  ready: false,
  running: false,
  done: true,
  failed: true,
  skipped: true,
};

/** One node's mutable record. */
export interface NodeRecord {
  state: TaskNodeState;
  lastError: string | null;
  attempts: number;
}

/**
 * The state map, keyed by task id.
 *
 * One per engine, and not exposed to callers: they read it through the
 * engine's `statusMap`, which fills in a default for nodes that exist in
 * the graph but have never run.
 */
export class NodeStates {
  readonly #nodes = new Map<string, NodeRecord>();

  /**
   * The raw record, or undefined if the node is unknown.
   * @param taskId
   */
  get(taskId: string,): NodeRecord | undefined {
    return this.#nodes.get(taskId,);
  }

  /** Register a node if new. A fresh node reads as `blocked`; the first
   *  pass promotes it once its prerequisites land.
   * @param taskId
   */
  touch(taskId: string,): void {
    if (this.#nodes.has(taskId,)) { return; }
    this.#nodes.set(taskId, { state: "blocked", lastError: null, attempts: 0, },);
  }

  /**
   * May this node be dispatched? It must have a body, must not have
   * settled already, and must have every prerequisite `done`.
   * @param taskId
   * @param hasBody whether a body is registered for it this pass
   * @param prerequisitesDone whether every prerequisite reached `done`
   */
  dispatchable(taskId: string, hasBody: boolean, prerequisitesDone: boolean,): boolean {
    if (!hasBody) { return false; }
    const node = this.#nodes.get(taskId,);
    if (node === undefined || SETTLED[node.state]) { return false; }
    return prerequisitesDone;
  }

  /** Mark a node in flight and count the attempt.
   * @param taskId
   * @returns the zero-based attempt index, or null if the node is unknown
   */
  begin(taskId: string,): number | null {
    const node = this.#nodes.get(taskId,);
    if (node === undefined) { return null; }
    node.state = "running";
    node.attempts += 1;
    return node.attempts - 1;
  }

  /** @param taskId */
  succeed(taskId: string,): void {
    const node = this.#nodes.get(taskId,);
    if (node === undefined) { return; }
    node.state = "done";
    node.lastError = null;
  }

  /**
   * @param taskId @param message why it failed
   * @param message
   */
  fail(taskId: string, message: string,): void {
    const node = this.#nodes.get(taskId,);
    if (node === undefined) { return; }
    node.state = "failed";
    node.lastError = message;
  }

  /** @param taskId */
  skip(taskId: string,): void {
    const node = this.#nodes.get(taskId,);
    if (node === undefined) { return; }
    node.state = "skipped";
  }

  /**
   * Put a node back in play and clear its error, so failed work can be
   * re-attempted. It goes to `ready` rather than straight to dispatch: a
   * later pass picks it up once its prerequisites are `done`.
   * @param taskId
   */
  reset(taskId: string,): void {
    const node = this.#nodes.get(taskId,);
    if (node === undefined) { return; }
    node.state = "ready";
    node.lastError = null;
  }

  /**
   * The status view for one node, defaulting an unseen one to `blocked`.
   * @param taskId
   */
  statusFor(taskId: string,): TaskNodeStatus {
    const node = this.#nodes.get(taskId,);
    return {
      taskId,
      state: node?.state ?? "blocked",
      lastError: node?.lastError ?? null,
      attempts: node?.attempts ?? 0,
    };
  }
}
