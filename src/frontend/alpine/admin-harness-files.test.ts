// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness tab sandbox file tree: row shaping, editor links, and the failure
 * classification.
 *
 * The slice had no dedicated test file, so a change to it was only covered by
 * the full-suite run. These cases pin the shapes the markup depends on (the
 * size label, the editor URI) and the failure messages: `feFetch` REJECTS on
 * a non-2xx, so a 403 arrives on the thrown error, not on a Response.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  buildFileRows,
  editorFileRoot,
  formatBytes,
  type HarnessFilesState,
  loadHarnessFiles,
  sandboxEditorHref,
} from "./admin-harness-files";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
  __EDITOR_FILE_ROOT__?: unknown;
};

const localeHost = globalThis as unknown as { __localeStrings?: unknown };

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
const originalFileRoot = globalState.__EDITOR_FILE_ROOT__;
const originalLocale = localeHost.__localeStrings;

let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({ root: "", path: "", entries: [], },);

// `t()` resolves against the server-injected catalog; seed it from the real
// en.json so the messages render translated.
const EN = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/locales/en.json",), "utf8",),
) as Record<string, unknown>;

beforeEach(() => {
  calls = [];
  handler = async () => Response.json({ root: "", path: "", entries: [], },);
  globalState.apiFetch = (url, opts,) => {
    calls.push(url,);
    return handler(url, opts,);
  };

  globalState.showToast = () => {};
  globalState.__EDITOR_FILE_ROOT__ = "/srv/repo";
  localeHost.__localeStrings = EN;
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  globalState.__EDITOR_FILE_ROOT__ = originalFileRoot;
  localeHost.__localeStrings = originalLocale;
},);

/** An error shaped like the one `feFetch` rejects with. */
function thrown(status: number,): Error & { status?: number } {
  return Object.assign(new Error(`HTTP ${status}`,), { status, },);
}

/** A live slice state for the given run. */
function filesState(runId = "run-1",): HarnessFilesState {
  return {
    harnessRunId: runId,
    harnessFilesOpen: false,
    loadingHarnessFiles: false,
    harnessFilesError: "",
    harnessFilesRoot: "",
    harnessFilesPath: "",
    harnessFileRows: [],
  };
}

describe("formatBytes", () => {
  test("bytes read in bytes", () => {
    expect(formatBytes(0,),).toBe("0 B",);
    expect(formatBytes(512,),).toBe("512 B",);
    expect(formatBytes(1023,),).toBe("1023 B",);
  });

  test("larger sizes read in the biggest unit that fits", () => {
    expect(formatBytes(1024,),).toBe("1.0 KB",);
    expect(formatBytes(1024 * 1024,),).toBe("1.0 MB",);
    expect(formatBytes(1024 ** 3,),).toBe("1.0 GB",);
    expect(formatBytes(1024 ** 4,),).toBe("1.0 TB",);
    // Past the largest unit the scale stops at TB.
    expect(formatBytes(1024 ** 5,),).toBe("1024.0 TB",);
  });

  test("an impossible size renders a dash", () => {
    expect(formatBytes(-1,),).toBe("—",);
    expect(formatBytes(Number.NaN,),).toBe("—",);
    expect(formatBytes(Number.POSITIVE_INFINITY,),).toBe("—",);
  });
});

describe("buildFileRows", () => {
  test("every entry gets a pre-formatted size", () => {
    const rows = buildFileRows({
      root: "src",
      path: "",
      entries: [
        { name: "notes.md", path: "src/notes.md", type: "file", size: 2048, mtimeMs: 1, },
        { name: "sub", path: "src/sub", type: "dir", size: 0, mtimeMs: 2, },
      ],
    },);

    expect(rows,).toHaveLength(2,);
    expect(rows[0]!.sizeLabel,).toBe("2.0 KB",);
    expect(rows[0]!.name,).toBe("notes.md",);
    expect(rows[1]!.sizeLabel,).toBe("0 B",);
  });
});

describe("editorFileRoot", () => {
  test("the server-seeded root is the editor root", () => {
    expect(editorFileRoot(),).toBe("/srv/repo",);
  });

  test("no seeded root means open-in-editor is unavailable", () => {
    globalState.__EDITOR_FILE_ROOT__ = undefined;
    expect(editorFileRoot(),).toBe("",);
  });
});

describe("sandboxEditorHref", () => {
  test("an editor link points at the entry under the sandbox root", () => {
    expect(sandboxEditorHref("/srv/repo", "src", "notes.md",),).toBe(
      "vscode://file//srv/repo/src/notes.md",
    );
  });

  test("no editor root means no link", () => {
    expect(sandboxEditorHref("", "src", "notes.md",),).toBe("",);
  });
});

describe("loadHarnessFiles", () => {
  test("a listing fills the rows and the root", async () => {
    handler = async () =>
      Response.json({
        root: "src",
        path: "",
        entries: [{ name: "notes.md", path: "src/notes.md", type: "file", size: 12, mtimeMs: 1, },],
      },);

    const state = filesState();
    await loadHarnessFiles(state, "run-1", "",);

    expect(calls,).toEqual(["/api/v1/harness/runs/run-1/files",],);
    expect(state.harnessFilesRoot,).toBe("src",);
    expect(state.harnessFileRows,).toHaveLength(1,);
    expect(state.harnessFileRows[0]!.sizeLabel,).toBe("12 B",);
    expect(state.harnessFilesError,).toBe("",);
    expect(state.loadingHarnessFiles,).toBe(false,);
  });

  test("a subdirectory is asked for by path", async () => {
    const state = filesState();
    await loadHarnessFiles(state, "run-1", "src/deep",);

    expect(calls,).toEqual(["/api/v1/harness/runs/run-1/files?path=src%2Fdeep",],);
  });

  test("a 403 response says the caller lacks permission", async () => {
    handler = async () => new Response("{}", { status: 403, },);

    const state = filesState();
    await loadHarnessFiles(state, "run-1", "",);

    expect(state.harnessFilesError,).toBe("You do not have permission to view harness data.",);
    expect(state.harnessFileRows,).toEqual([],);
  });

  test("a rejected request names the failure instead of the network", async () => {
    handler = async () => {
      throw thrown(403,);
    };

    const state = filesState();
    await loadHarnessFiles(state, "run-1", "",);

    expect(state.harnessFilesError,).toBe("You do not have permission to view harness data.",);
  });

  test("a request that never got an answer says the server is unreachable", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = filesState();
    await loadHarnessFiles(state, "run-1", "",);

    expect(state.harnessFilesError,).toBe(
      "Could not reach the harness API. Check that the server is running.",
    );
  });

  test("a response the schema rejects reports the shape failure", async () => {
    handler = async () => Response.json({ root: 42, },);

    const state = filesState();
    await loadHarnessFiles(state, "run-1", "",);

    expect(state.harnessFilesError,).toBe("Could not load the sandbox file tree.",);
  });

  test("a stale response is discarded", async () => {
    handler = async () =>
      Response.json({
        root: "src",
        path: "",
        entries: [{ name: "notes.md", path: "src/notes.md", type: "file", size: 12, mtimeMs: 1, },],
      },);

    // The user switched runs while the listing was in flight.
    const state = filesState("run-2",);
    await loadHarnessFiles(state, "run-1", "",);

    expect(state.harnessFilesRoot,).toBe("",);
    expect(state.harnessFileRows,).toEqual([],);
  });
});
