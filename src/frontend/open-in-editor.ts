// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/frontend/open-in-editor.ts — approach A: open-in-$EDITOR URI-scheme links
// (epic-browser-editor-support). The server seeds two globals in the layout
// bootstrap: __EDITOR__ (scheme from web.editor) and __EDITOR_FILE_ROOT__
// (absolute repo root the data-editor-path values resolve against).

/** Editor schemes with a `scheme://file/<path>:<line>` shape. */
const FILE_SCHEMES = new Set(["vscode", "zed", "cursor",],);

/** JetBrains needs its own query-string shape. */
const IDEA_SCHEME = "idea";

const DEFAULT_EDITOR = "vscode";

/** Editor-link options. */
export interface EditorUrlOptions {
  /** File path the editor resolves. */
  path: string;
  /** 1-based line to land on, when known. */
  line?: number;
  /** Editor scheme override; defaults to the server-seeded __EDITOR__ global. */
  editor?: string;
}

/**
 * @param editor - candidate scheme.
 * @returns the validated scheme, or the vscode default for unknown/missing values.
 */
function resolveEditorPreference(editor?: string,): string {
  const candidate = editor ?? (globalThis as { __EDITOR__?: unknown }).__EDITOR__;
  return typeof candidate === "string" && (FILE_SCHEMES.has(candidate,) || candidate === IDEA_SCHEME)
    ? candidate
    : DEFAULT_EDITOR;
}

/**
 * Build an open-in-editor URI for a GUI editor.
 * @param options - path, optional line, optional editor scheme override.
 * @returns the `vscode://`/`zed://`/`cursor://`/`idea://` URI.
 */
export function editorUrl(options: EditorUrlOptions,): string {
  const scheme = resolveEditorPreference(options.editor,);
  const encodedPath = options.path.split("/",).map(encodeURIComponent,).join("/",);
  const line = options.line !== undefined ? `:${options.line}` : "";
  if (scheme === IDEA_SCHEME) {
    const ideaLine = options.line !== undefined ? `&line=${options.line}` : "";
    return `idea://open?file=${encodedPath}${ideaLine}`;
  }

  return `${scheme}://file/${encodedPath}${line}`;
}

/**
 * @param root - absolute root directory.
 * @param path - repo-relative path.
 * @returns the joined absolute path with a single separator.
 */
export function joinEditorPath(root: string, path: string,): string {
  return `${root.replace(/\/+$/, "",)}/${path.replace(/^\/+/, "",)}`;
}

/**
 * Hydrate `a[data-editor-path]` anchors into editor links. Anchors are hidden
 * when the server did not seed __EDITOR_FILE_ROOT__ (feature unavailable).
 * @param root - subtree to scan; defaults to the document.
 */
export function enhanceOpenInEditorLinks(root: ParentNode = globalThis.document,): void {
  const seeded = (globalThis as { __EDITOR_FILE_ROOT__?: unknown }).__EDITOR_FILE_ROOT__;
  const fileRoot = typeof seeded === "string" ? seeded : "";
  for (const anchor of root.querySelectorAll("a[data-editor-path]",)) {
    const path = anchor.getAttribute("data-editor-path",) ?? "";
    if (!fileRoot || !path) {
      anchor.setAttribute("hidden", "",);
      continue;
    }

    const lineAttr = anchor.getAttribute("data-editor-line",);
    const parsed = lineAttr === null ? Number.NaN : Number.parseInt(lineAttr, 10,);
    anchor.setAttribute(
      "href",
      editorUrl({ path: joinEditorPath(fileRoot, path,), line: Number.isNaN(parsed,) ? undefined : parsed, },),
    );

    anchor.removeAttribute("hidden",);
  }
}
