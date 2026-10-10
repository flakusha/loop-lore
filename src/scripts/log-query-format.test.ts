// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the `logs:query --format table` renderer.
 *
 * The end-to-end path (query rows -> render) is covered by log-query.test.ts;
 * this file pins the cell-level branches that a seeded row never exercises.
 */
import { describe, expect, test, } from "bun:test";
import { formatTable, type LogTableRow, } from "./log-query-format";

const row = (over: Partial<LogTableRow> = {},): LogTableRow => ({
  created_at: "2026-01-10 00:00:00",
  level: 40,
  event_type: "moderation.chat.ban",
  entity_type: "chat",
  entity_id: "c-1",
  user_id: "u-1",
  message: "banned from chat",
  ...over,
});

describe("formatTable", () => {
  test("renders the header plus one padded row per entry", () => {
    const lines = formatTable([row(),],).split("\n",);
    expect(lines,).toHaveLength(2,);
    expect(lines[0],).toContain("CREATED_AT",);
    expect(lines[0],).toContain("MESSAGE",);
    expect(lines[1],).toContain("banned from chat",);
  });

  test("entity renders as <type>:<id> when an id is present", () => {
    expect(formatTable([row(),],).split("\n",)[1],).toContain("chat:c-1",);
  });

  test("null columns render as a dash placeholder", () => {
    const line = formatTable([
      row({ created_at: null, event_type: null, entity_id: null, user_id: null, },),
    ],).split("\n",)[1]!;

    expect(line,).toContain("-",);

    expect(line,).not.toContain("null",);
  });

  test("messages are truncated to 60 characters", () => {
    const message = "x".repeat(80,);
    const line = formatTable([row({ message, },),],).split("\n",)[1]!;
    expect(line,).toContain("x".repeat(60,),);
    expect(line,).not.toContain("x".repeat(61,),);
  });

  test("no rows renders the header alone", () => {
    expect(formatTable([],).split("\n",),).toHaveLength(1,);
  });
});
