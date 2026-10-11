// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Isolation + dedup contract (epic-hidden-carriage-context §Isolation):
 * player prompts carry zero `gm`-class entries; the same fact from two
 * systems injects once (first source wins); shadow write-back to
 * player-visible stores is rejected with a dev-visible message.
 */
import { describe, expect, test, } from "bun:test";
import {
  assembleEntries,
  createAssemblyGate,
  entryHash,
  filterVisible,
  guardShadowWriteback,
  type InjectableEntry,
} from "./carriage-isolation";

const fact = (system: string, id = "1",): InjectableEntry => ({
  system: system,
  id: id,
  content: "The ruin door is sealed.",
  visibility: "player",
});

describe("filterVisible", () => {
  test("player prompts carry zero gm-class entries", () => {
    const entries: InjectableEntry[] = [
      fact("notes",),
      { ...fact("shadow", "s1",), visibility: "gm", },
    ];

    const visible = filterVisible(entries, "player",);
    expect(visible,).toHaveLength(1,);
    expect(visible[0]!.system,).toBe("notes",);
  });

  test("gm flows receive gm-class entries marked read-only", () => {
    const visible = filterVisible([{ ...fact("shadow", "s1",), visibility: "gm", },], "gm",);
    expect(visible,).toHaveLength(1,);
    expect(visible[0]!.shadowReadOnly,).toBe(true,);
  });

  test("debug-only entries stay out of gm flows", () => {
    const visible = filterVisible([{ ...fact("shadow", "s1",), visibility: "debug", },], "gm",);
    expect(visible,).toHaveLength(0,);
  });
});

describe("assembleEntries", () => {
  test("same fact from carriage + note injects once, first source wins", () => {
    const { entries, duplicates, } = assembleEntries([fact("carriage",), fact("notes",),], "player",);
    expect(entries,).toHaveLength(1,);
    expect(entries[0]!.system,).toBe("carriage",);
    expect(duplicates,).toHaveLength(1,);
    expect(duplicates[0]!.entry.system,).toBe("notes",);
    expect(duplicates[0]!.hash,).toBe(entryHash(fact("notes",),),);
  });

  test("shadow-scoped player read returns empty (no spoiler feedback loop)", () => {
    const { entries, } = assembleEntries(
      [{ ...fact("shadow", "s1",), visibility: "player", },],
      "player",
    );

    expect(entries,).toHaveLength(0,);
  });

  test("distinct facts all inject", () => {
    const a = fact("carriage",);
    const b: InjectableEntry = { ...fact("notes",), content: "The elder woke.", };
    expect(assembleEntries([a, b,], "player",).entries,).toHaveLength(2,);
  });
});

describe("createAssemblyGate", () => {
  test("dedups across sections: first submitting section wins", () => {
    const gate = createAssemblyGate("player",);
    const first = gate.submit([fact("memory",),],);
    const second = gate.submit([fact("carriage",),],);
    expect(first,).toHaveLength(1,);
    expect(second,).toHaveLength(0,);
    const report = gate.report();
    expect(report.role,).toBe("player",);
    expect(report.duplicates,).toHaveLength(1,);
    expect(report.duplicates[0]!.entry.system,).toBe("carriage",);
    expect(report.duplicates[0]!.firstIndex,).toBe(0,);
  });

  test("reports shadow-leak entries for the player role", () => {
    const gate = createAssemblyGate("player",);
    const kept = gate.submit([
      fact("notes",),
      // A shadow-system entry mis-tagged player-visible: the leak guard
      // drops it and reports it (cross-system negative read).
      { ...fact("gmNotes-shadow", "s1",), visibility: "player" as const, },
    ],);

    expect(kept,).toHaveLength(1,);
    expect(gate.report().suppressed,).toHaveLength(1,);
    expect(gate.report().suppressed[0]!.id,).toBe("s1",);
  });

  test("a fact can repeat inside one submission and across submissions", () => {
    const gate = createAssemblyGate("player",);
    const first = gate.submit([fact("memory",), fact("memory", "2",),],);
    expect(first,).toHaveLength(1,);
    expect(gate.submit([fact("notes",),],),).toHaveLength(0,);
    expect(gate.report().duplicates,).toHaveLength(2,);
  });

  test("gm flow admits gm-class entries exactly once across submissions", () => {
    const gate = createAssemblyGate("gm",);
    const [first,] = gate.submit([
      { ...fact("gmNotes-shadow", "s1",), visibility: "gm" as const, },
    ],);

    expect(first!.shadowReadOnly,).toBe(true,);
    expect(gate.submit([
      { ...fact("memory", "s1-copy",), visibility: "gm" as const, },
    ],),).toHaveLength(0,);
  });
});

describe("guardShadowWriteback", () => {
  test("shadow-marked entries reject persistence to player stores", () => {
    const msg = guardShadowWriteback(
      [{ ...fact("shadow", "s1",), visibility: "gm", shadowReadOnly: true, },],
      "carriage",
    );

    expect(msg,).toContain("Shadow write-back blocked",);
    expect(msg,).toContain("shadow:s1",);
  });

  test("player entries and shadow-target writes pass", () => {
    expect(guardShadowWriteback([fact("notes",),], "carriage",),).toBeNull();
    expect(
      guardShadowWriteback([{ ...fact("shadow", "s1",), visibility: "gm", },], "shadow",),
    ).toBeNull();
  });
});
