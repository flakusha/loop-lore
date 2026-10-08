// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Healing contract tests: approve vs cancel + reason code per format. */
import { describe, expect, test, } from "bun:test";
import {
  CARRIAGE_REPAIR_HINT,
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
});
