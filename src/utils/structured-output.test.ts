// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Healing contract tests: approve vs cancel + reason code per format. */
import { describe, expect, test, } from "bun:test";
import {
  CARRIAGE_REPAIR_HINT,
  DEFAULT_CARRIAGE_MAX_BYTES,
  healCarriage,
  healStructuredOutput,
  isCarriageDoc,
} from "./structured-output";

const VALID_TOML = [
  "episode = 4",
  'title = "The Sleeper\'s Warning"',
  "[[characters]]",
  'name = "K"',
  'status = "Inside the ruin"',
].join("\n",);

/**
 * Valid carriage TOML padded to exactly `bytes` UTF-8 bytes.
 * @param bytes - target document size
 * @returns a canonical carriage doc of that byte length
 */
function carriageTomlOfSize(bytes: number,) {
  const prefix = `\nsetting = "`;
  const suffix = `"`;
  const used = new TextEncoder().encode(VALID_TOML + prefix + suffix,).length;
  return `${VALID_TOML}${prefix}${"s".repeat(bytes - used,)}${suffix}`;
}

describe("healStructuredOutput", () => {
  test("approves valid input unhealed", () => {
    const out = healStructuredOutput({
      format: "toml",
      raw: VALID_TOML,
      maxBytes: 1024,
      validate: isCarriageDoc,
    },);

    expect(out.ok,).toBe(true,);
    if (out.ok) {
      expect(out.healed,).toBe(false,);
      expect(out.value.characters,).toHaveLength(1,);
    }
  });

  test("heals truncated TOML to the parseable prefix", () => {
    const out = healStructuredOutput({
      format: "toml",
      raw: `${VALID_TOML}\nstatus = `,
      maxBytes: 1024,
      validate: isCarriageDoc,
    },);

    expect(out.ok,).toBe(true,);
    if (out.ok) { expect(out.healed,).toBe(true,); }
  });

  test("oversize always cancels, never truncates silently", () => {
    const out = healStructuredOutput({
      format: "toml",
      raw: VALID_TOML,
      maxBytes: 10,
      validate: isCarriageDoc,
    },);

    expect(out,).toEqual({ ok: false, reason: "oversize", hint: expect.any(String,), },);
  });

  test("unparseable cancels with code", () => {
    const out = healStructuredOutput({
      format: "toml",
      raw: "[[[!!!",
      maxBytes: 1024,
      validate: isCarriageDoc,
    },);

    expect(out.ok,).toBe(false,);
    if (!out.ok) { expect(out.reason,).toBe("unparseable",); }
  });
});

describe("healCarriage", () => {
  test("flat characters list fails with the repair hint", () => {
    const out = healCarriage('characters = ["K", "G"]\n',);
    expect(out.ok,).toBe(false,);
    if (!out.ok) {
      expect(out.reason,).toBe("schema_violation",);
      expect(out.hint,).toBe(CARRIAGE_REPAIR_HINT,);
    }
  });

  test("valid canonical shape approves", () => {
    expect(healCarriage(VALID_TOML,).ok,).toBe(true,);
  });

  test("defaults to an 8 KiB cap", () => {
    expect(DEFAULT_CARRIAGE_MAX_BYTES,).toBe(8 * 1024,);
  });

  test("the default cap rejects a payload one byte over it", () => {
    const over = carriageTomlOfSize(DEFAULT_CARRIAGE_MAX_BYTES + 1,);
    expect(new TextEncoder().encode(over,).length,).toBe(DEFAULT_CARRIAGE_MAX_BYTES + 1,);

    const out = healCarriage(over,);
    expect(out.ok,).toBe(false,);
    if (!out.ok) {
      expect(out.reason,).toBe("oversize",);
      expect(out.hint,).toContain(`${DEFAULT_CARRIAGE_MAX_BYTES}-byte cap`,);
    }
  });

  test("the default cap admits a payload exactly at it", () => {
    const at = carriageTomlOfSize(DEFAULT_CARRIAGE_MAX_BYTES,);
    expect(new TextEncoder().encode(at,).length,).toBe(DEFAULT_CARRIAGE_MAX_BYTES,);
    expect(healCarriage(at,).ok,).toBe(true,);
  });
});
