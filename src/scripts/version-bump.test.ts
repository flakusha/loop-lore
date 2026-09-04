import { afterAll, describe, expect, test, } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import { join, } from "node:path";
import { safeJsonParse, } from "../utils/safe-json";

/**
 * Test the safe-parse behavior of version-bump.ts by exercising the same
 * logic with controlled inputs. The script's top-level side-effect (`main()`)
 * cannot run in a unit test without clobbering a real `package.json`.
 * Instead, verify the underlying contract that its `readPackageJson` helper
 * now relies on: `safeJsonParse` returns `{ ok: false }` on malformed input
 * rather than throwing, and round-trips on valid input.
 */

let sandboxDir: string | null = null;

describe("version-bump safe-parse contract", () => {
  afterAll(() => {
    if (sandboxDir !== null) { rmSync(sandboxDir, { recursive: true, force: true, },); }
  },);

  test("safeJsonParse returns ok:false on malformed JSON", () => {
    const result = safeJsonParse<{ version?: string }>("{ not json",);
    expect(result.ok,).toBe(false,);
    if (!result.ok) { expect(result.error,).toBeInstanceOf(Error,); }
  });

  test("safeJsonParse round-trips a valid package.json-shaped object", () => {
    sandboxDir = mkdtempSync(join(tmpdir(), "version-bump-test-",),);
    const fakePackagePath = join(sandboxDir, "package.json",);
    const original = { name: "test", version: "1.2.3-rc.1", };
    writeFileSync(fakePackagePath, JSON.stringify(original,),);
    const text = readFileSync(fakePackagePath, "utf-8",);
    const result = safeJsonParse<{ name?: string; version?: string }>(text,);
    expect(result.ok,).toBe(true,);
    if (result.ok) {
      expect(result.value.name,).toBe("test",);
      expect(result.value.version,).toBe("1.2.3-rc.1",);
    }
  });
});
