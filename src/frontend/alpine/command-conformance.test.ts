// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Command conformance vectors — the ONE shared fixture both clients run.
 *
 * `native/loop-lore-egui/command-vectors.json` is the frozen output of
 * `GET /api/v1/commands` (names + role gates) plus the shared role-gate truth
 * table. The Rust crate's `command.rs` tests assert against the same file, so
 * any drift between the server registry and either client fails on whichever
 * side moved. This suite pins the TS half of that contract.
 */
import { describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { getCommandRequirement, listCommands, } from "../../assistant/commands/registry";
import "../../assistant/commands/index";
import { satisfiesPaletteRole, } from "./chat-actions/command-palette";
import { filterSlashCandidates, } from "./slash-query";

interface Vectors {
  commands: { name: string; requiredRole?: string }[];
  roleGate: { viewer: string | null; required: string | null; visible: boolean }[];
  filter: { query: string; expected: string[] }[];
}

const VECTORS: Vectors = JSON.parse(
  readFileSync(join(import.meta.dir, "../../../native/loop-lore-egui/command-vectors.json",), "utf8",),
) as Vectors;

describe("command conformance vectors", () => {
  test("live registry matches the frozen command list (names + role gates)", () => {
    const live: Vectors["commands"] = listCommands().map((name,) => {
      const requiredRole = getCommandRequirement(name,);
      return requiredRole ? { name, requiredRole, } : { name, };
    },);

    // Registration order is not a contract: a test file that imports a single
    // command module before the barrel registers it earlier in the list. The
    // frozen vector is compared by name so the check stays deterministic.
    const byName = (a: Vectors["commands"][number], b: Vectors["commands"][number],) => a.name.localeCompare(b.name,);

    expect([...live,].sort(byName,),).toEqual([...VECTORS.commands,].sort(byName,),);
  });

  test("role gate matches the frozen truth table", () => {
    for (const { viewer, required, visible, } of VECTORS.roleGate) {
      expect(satisfiesPaletteRole(viewer ?? undefined, required ?? undefined,),).toBe(visible,);
    }
  });

  test("slash filter matches the frozen output", () => {
    const names = VECTORS.commands.map((c,) => c.name);
    for (const { query, expected, } of VECTORS.filter) {
      expect(filterSlashCandidates(names, query,),).toEqual(expected,);
    }
  });
});
