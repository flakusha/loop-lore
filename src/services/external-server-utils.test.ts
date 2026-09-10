// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * External server utilities — coverage tests for `isHuggingFaceRef`.
 *
 * Pure regex validator: `"<org>/<repo>:<file>"` is the canonical HF
 * reference form; everything else (local paths, partial refs, names with
 * unsupported characters) is rejected so the caller can fall back to a
 * local file lookup.
 *
 * The implementation uses `/^[\w-]+\/[\w.-]+:\w+$/i`:
 *   - `<org>`  : word chars + hyphen (one or more)
 *   - `/`
 *   - `<repo>` : word chars + dot + hyphen (one or more)
 *   - `:`
 *   - `<file>` : word chars only (no dots, no hyphens) — surprising, but it
 *     is the current behavior. Dot in the file portion rejects the input.
 */
import { describe, expect, test, } from "bun:test";
import { isHuggingFaceRef, } from "./external-server-utils";

describe("isHuggingFaceRef", () => {
  test("accepts canonical org/repo:file references", () => {
    expect(isHuggingFaceRef("user/repo:model")).toBe(true);
    expect(isHuggingFaceRef("TheBloke/Llama2:weights")).toBe(true);
  });

  test("accepts mixed case and digits in segments", () => {
    expect(isHuggingFaceRef("Org123/Repo_v2:weights")).toBe(true);
    expect(isHuggingFaceRef("a/b:c")).toBe(true);
  });

  test("accepts hyphens in org and repo segments", () => {
    expect(isHuggingFaceRef("some-user/some-repo:file")).toBe(true);
  });

  test("accepts underscores in segments", () => {
    expect(isHuggingFaceRef("user/repo_name:file_name")).toBe(true);
  });

  test("rejects local file paths", () => {
    expect(isHuggingFaceRef("./models/llama.gguf")).toBe(false);
    expect(isHuggingFaceRef("/usr/local/share/models/llama.gguf")).toBe(false);
    expect(isHuggingFaceRef("models/llama.gguf")).toBe(false);
    expect(isHuggingFaceRef("model.gguf")).toBe(false);
  });

  test("rejects missing file suffix segment", () => {
    expect(isHuggingFaceRef("user/repo")).toBe(false);
    expect(isHuggingFaceRef("user/")).toBe(false);
    expect(isHuggingFaceRef("/repo:file")).toBe(false);
  });

  test("rejects empty / whitespace input", () => {
    expect(isHuggingFaceRef("")).toBe(false);
    expect(isHuggingFaceRef("   ")).toBe(false);
  });

  test("rejects references with whitespace or unsupported punctuation", () => {
    expect(isHuggingFaceRef("user name/repo:file")).toBe(false);
    expect(isHuggingFaceRef("user/repo name:file")).toBe(false);
    expect(isHuggingFaceRef("user/repo:file with space")).toBe(false);
  });

  test("rejects references missing the colon separator", () => {
    expect(isHuggingFaceRef("user/repo-file")).toBe(false);
    expect(isHuggingFaceRef("user-repo:file")).toBe(false);
  });

  test("rejects file portions containing a dot (regex limits to \\w+)", () => {
    // Documenting current behavior: `:` is followed by `\w+` only.
    expect(isHuggingFaceRef("user/repo:weights.gguf")).toBe(false);
    expect(isHuggingFaceRef("user/repo:model.safetensors")).toBe(false);
  });

  test("rejects references with slashes in the file portion", () => {
    // After the colon, no further '/' allowed by the regex.
    expect(isHuggingFaceRef("user/repo:file/extra")).toBe(false);
    expect(isHuggingFaceRef("user/repo:")).toBe(false);
  });
});
