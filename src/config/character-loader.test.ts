// src/config/character-loader.test.ts — Unit tests for character file loader

import { describe, expect, test, } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, } from "node:fs";
import path from "node:path";
import { loadCharacterFiles, } from "./character-loader";

const TEST_DIR = path.join(import.meta.dir, "../../test-fixtures/character-loader",);

// ── Helpers ─────────────────────────────────────────────────

function setupTestDir(): void {
  if (existsSync(TEST_DIR,)) {
    rmSync(TEST_DIR, { recursive: true, },);
  }
  mkdirSync(TEST_DIR, { recursive: true, },);
  mkdirSync(path.join(TEST_DIR, "configs", "characters",), { recursive: true, },);
}

function teardownTestDir(): void {
  if (existsSync(TEST_DIR,)) {
    rmSync(TEST_DIR, { recursive: true, },);
  }
}

function writeCharacterFile(name: string, content: string,): void {
  const filePath = path.join(TEST_DIR, "configs", "characters", name,);
  writeFileSync(filePath, content,);
}

// ── Tests ───────────────────────────────────────────────────

describe("loadCharacterFiles", () => {
  test("loads single-character YAML file", () => {
    setupTestDir();

    writeCharacterFile(
      "test-character.yaml",
      `
name: "Test Character"
description: "A test character for unit tests"
personality: "Friendly and helpful"
visibility: "public"
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.name,).toBe("Test Character",);
    expect(characters[0]?.description,).toBe("A test character for unit tests",);
    expect(characters[0]?.visibility,).toBe("public",);

    teardownTestDir();
  });

  test("loads single-character TOML file", () => {
    setupTestDir();

    writeCharacterFile(
      "test-character.toml",
      `
name = "Test Character"
description = "A test character for unit tests"
personality = "Friendly and helpful"
visibility = "public"
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.name,).toBe("Test Character",);
    expect(characters[0]?.description,).toBe("A test character for unit tests",);

    teardownTestDir();
  });

  test("loads multi-character YAML file", () => {
    setupTestDir();

    writeCharacterFile(
      "multi-character.yaml",
      `
templates:
  - name: "Character 1"
    description: "First character"
  - name: "Character 2"
    description: "Second character"
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(2,);
    expect(characters[0]?.name,).toBe("Character 1",);
    expect(characters[1]?.name,).toBe("Character 2",);

    teardownTestDir();
  });

  test("loads multi-character TOML file", () => {
    setupTestDir();

    writeCharacterFile(
      "multi-character.toml",
      `
[[templates]]
name = "Character 1"
description = "First character"

[[templates]]
name = "Character 2"
description = "Second character"
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(2,);
    expect(characters[0]?.name,).toBe("Character 1",);
    expect(characters[1]?.name,).toBe("Character 2",);

    teardownTestDir();
  });

  test("merges characters by name (last wins)", () => {
    setupTestDir();

    writeCharacterFile(
      "override.yaml",
      `
name: "Shared Character"
description: "Overridden version"
`,
    );

    writeCharacterFile(
      "original.yaml",
      `
name: "Shared Character"
description: "Original version"
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.description,).toBe("Overridden version",);

    teardownTestDir();
  });

  test("handles hard IDs for test reseeding", () => {
    setupTestDir();

    writeCharacterFile(
      "hard-id.yaml",
      `
id: "tpl-test-character"
name: "Test Character"
description: "With hard ID"
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.id,).toBe("tpl-test-character",);

    teardownTestDir();
  });

  test("handles multiline strings (YAML folded)", () => {
    setupTestDir();

    writeCharacterFile(
      "multiline.yaml",
      `
name: "Multiline Character"
description: >
  This is a long description
  that spans multiple lines
  and should be folded into one.
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.description,).toContain("This is a long description",);

    teardownTestDir();
  });

  test("handles multiline strings (YAML literal)", () => {
    setupTestDir();

    writeCharacterFile(
      "literal.yaml",
      `name: "Literal Character"
description: "A character with literal multiline"
welcome_message: |
  Line 1
  Line 2
  Line 3
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.welcome_message,).toContain("Line 1",);
    expect(characters[0]?.welcome_message,).toContain("Line 2",);

    teardownTestDir();
  });

  test("handles multiline strings (TOML triple quotes)", () => {
    setupTestDir();

    writeCharacterFile(
      "toml-multiline.toml",
      `
name = "TOML Multiline"
description = """
This is a long description
that spans multiple lines
and should be folded into one."""
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.description,).toContain("This is a long description",);

    teardownTestDir();
  });

  test("skips non-character files", () => {
    setupTestDir();

    writeCharacterFile(
      "valid.yaml",
      `
name: "Valid Character"
description: "Valid"
`,
    );

    writeCharacterFile(
      "notes.md",
      `
# Not a character file
This is just a markdown file.
`,
    );

    writeCharacterFile(
      "config.json",
      `
{"name": "Not YAML/TOML"}
`,
    );

    const characters = loadCharacterFiles(TEST_DIR,);

    expect(characters.length,).toBe(1,);
    expect(characters[0]?.name,).toBe("Valid Character",);

    teardownTestDir();
  });

  test("returns empty array for empty directory", () => {
    setupTestDir();
    const characters = loadCharacterFiles(TEST_DIR,);
    expect(characters.length,).toBe(0,);
    teardownTestDir();
  });
});
