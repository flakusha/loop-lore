// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Injectable seams shared by the agent worktree + check route plugins. */
import type { AgentAuthDeps, } from "./auth";

export interface SpawnArgs {
  cwd: string;
  branch: string;
  base: string | undefined;
  path: string;
}

export type SpawnWorktree = (args: SpawnArgs,) => Promise<void>;

export interface RemoveArgs {
  cwd: string;
  path: string;
}

export type RemoveWorktree = (args: RemoveArgs,) => Promise<void>;

export type MeasureDirectoryBytes = (path: string,) => Promise<number>;

/** A running `bun run check` process, consumed by the SSE handler. */
export interface CheckExecution {
  stream: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
}

export type RunCheck = (args: {
  cwd: string;
  gates: string | undefined;
},) => Promise<CheckExecution> | CheckExecution;

export interface AgentRouteOpts extends AgentAuthDeps {
  /** Git toplevel used as the spawn cwd and the worktree parent dir. */
  repoRoot?: string;
  spawnWorktree?: SpawnWorktree;
  removeWorktree?: RemoveWorktree;
  measureDirectoryBytes?: MeasureDirectoryBytes;
  runCheck?: RunCheck;
  now?: () => number;
}
