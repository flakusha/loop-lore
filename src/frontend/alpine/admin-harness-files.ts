// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Sandbox file-tree fetch + row shaping for the Harness tab (approach C,
 * epic-browser-editor-support).
 *
 * Split from `admin-harness.ts` like `admin-harness-detail.ts` to keep that
 * file under the 250L ceiling. The endpoint is read-only — the editor owns
 * writes — so this module only GETs one directory level at a time and shapes
 * the entries into table rows; opening happens via the approach-A `editorUrl`
 * helper against the server-seeded `__EDITOR_FILE_ROOT__`.
 */
import { editorUrl, joinEditorPath, } from "../open-in-editor";
import { harnessFailure, JSON_HEADERS, log, RUNS_URL, } from "./admin-harness-detail";
import { HarnessSandboxFilesNullable, } from "./admin-harness-schema";
import { t, } from "./i18n";
import { parseOr, } from "./validation";

/** One entry of the `/files` response (mirrors the wire shape). */
export interface SandboxEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  mtimeMs: number;
}

/** The `/files` response body (mirrors the wire shape). */
export interface SandboxFilesBody {
  root: string;
  path: string;
  entries: SandboxEntry[];
}

/** One rendered tree row: the entry plus the pre-formatted size cell. */
export interface SandboxFileRow extends SandboxEntry {
  sizeLabel: string;
}

/**
 * Format a byte count for a table cell (dirs are listed with size 0).
 * @param bytes - file size in bytes.
 * @returns compact human string, e.g. `12 B` / `3.4 KB`.
 */
export function formatBytes(bytes: number,): string {
  if (!Number.isFinite(bytes,) || bytes < 0) { return "\u2014"; }
  if (bytes < 1024) { return `${bytes} B`; }
  const units = ["KB", "MB", "GB", "TB",];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < units.length - 1);

  return `${value.toFixed(1,)} ${units[unit]}`;
}

/**
 * Shape the wire entries into table rows.
 * @param body - decoded `/files` body.
 * @returns rows with pre-formatted sizes, so markup does no formatting.
 */
export function buildFileRows(body: SandboxFilesBody,): SandboxFileRow[] {
  return body.entries.map((entry,) => ({ ...entry, sizeLabel: formatBytes(entry.size,), }));
}

/**
 * The seeded editor file root, or `""` when the server did not enable
 * open-in-editor (the same gate approach-A anchors use).
 * @returns the absolute root, or `""` when links must stay hidden.
 */
export function editorFileRoot(): string {
  const seeded = (globalThis as { __EDITOR_FILE_ROOT__?: unknown }).__EDITOR_FILE_ROOT__;
  return typeof seeded === "string" ? seeded : "";
}

/**
 * Build the open-in-editor URI for one sandbox entry.
 * @param fileRoot - absolute editor root (server-seeded).
 * @param sandboxRoot - repo-relative sandbox root from the `/files` body.
 * @param entryPath - entry path relative to the sandbox root.
 * @returns the editor URI (`""` when open-in-editor is unavailable).
 */
export function sandboxEditorHref(fileRoot: string, sandboxRoot: string, entryPath: string,): string {
  if (!fileRoot) { return ""; }
  return editorUrl({ path: joinEditorPath(fileRoot, `${sandboxRoot}/${entryPath}`,), },);
}

/** The slice of tab state the tree view touches. */
export interface HarnessFilesState {
  harnessRunId: string;
  harnessFilesOpen: boolean;
  loadingHarnessFiles: boolean;
  harnessFilesError: string;
  harnessFilesRoot: string;
  harnessFilesPath: string;
  harnessFileRows: SandboxFileRow[];
}

/**
 * Fetch one directory level of the run's sandbox tree into the tab state.
 * A stale response (the user switched runs mid-flight) is discarded, mirroring
 * the detail view's guard.
 * @param state - live tab state (mutated in place).
 * @param runId - the run whose sandbox is listed.
 * @param relPath - subdirectory to list; `""` lists the root.
 * @returns {Promise<void>}
 */
export async function loadHarnessFiles(state: HarnessFilesState, runId: string, relPath: string,): Promise<void> {
  state.harnessFilesOpen = true;
  state.loadingHarnessFiles = true;
  state.harnessFilesError = "";
  try {
    const query = relPath === "" ? "" : `?path=${encodeURIComponent(relPath,)}`;
    const res = await apiFetch(`${RUNS_URL}/${encodeURIComponent(runId,)}/files${query}`, JSON_HEADERS,);
    if (state.harnessRunId !== runId) { return; }
    const failure = await harnessFailure(res, "harness.filesError",);
    if (state.harnessRunId !== runId) { return; }
    if (failure !== null) {
      state.harnessFilesError = failure;
      return;
    }

    const data = parseOr(HarnessSandboxFilesNullable, await res.json(), null, () => {
      showToast("error", t("harness.errorShape",),);
    },);

    if (state.harnessRunId !== runId) { return; }
    if (data === null) {
      state.harnessFilesError = t("harness.filesError",);
      return;
    }

    state.harnessFilesRoot = data.root;
    state.harnessFilesPath = data.path;
    state.harnessFileRows = buildFileRows(data,);
  } catch (error) {
    if (state.harnessRunId !== runId) { return; }
    log.warn("Harness sandbox file listing failed", { error: String(error,), },);
    state.harnessFilesError = t("harness.errorNetwork",);
  } finally {
    if (state.harnessRunId === runId) { state.loadingHarnessFiles = false; }
  }
}
