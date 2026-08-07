/**
 * Tests for message archiving endpoints
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";

const ROUTES_DIR = import.meta.dir;

describe("message archiving routes", () => {
  test("messages/archiving.ts has archive endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "messages", "archiving.ts",), "utf8",);
    expect(content,).toContain("/api/messages/:id/archive",);
    expect(content,).toContain("archived_at",);
  });

  test("messages/archiving.ts has restore endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "messages", "archiving.ts",), "utf8",);
    expect(content,).toContain("/api/messages/:id/restore",);
  });

  test("messages/archiving.ts has purge endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "messages", "archiving.ts",), "utf8",);
    expect(content,).toContain("/api/chats/:id/messages/purge",);
  });
});

describe("batch chat operations", () => {
  test("chats.ts has batch archive endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "chats", "batch.ts",), "utf8",);
    expect(content,).toContain("/api/chats/batch/archive",);
  });

  test("chats.ts has batch delete endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "chats", "batch.ts",), "utf8",);
    expect(content,).toContain("/api/chats/batch/delete",);
  });

  test("chats.ts has batch export endpoint", () => {
    const content = readFileSync(join(ROUTES_DIR, "chats", "batch.ts",), "utf8",);
    expect(content,).toContain("/api/chats/batch/export",);
  });
});

describe("schema has archived_at", () => {
  test("schema-core.ts has archived_at column", () => {
    const content = readFileSync(join(import.meta.dir, "..", "db", "schema-core.ts",), "utf8",);
    expect(content,).toContain("archived_at",);
  });
});

describe("PinnedState has archived", () => {
  test("enums-core has Archived PinnedState", () => {
    const content = readFileSync(join(import.meta.dir, "..", "db", "enums-core", "flags.ts",), "utf8",);
    expect(content,).toContain('Archived: "archived"',);
  });
});
