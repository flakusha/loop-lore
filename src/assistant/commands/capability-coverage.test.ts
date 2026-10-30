// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Capability coverage - the fail-closed safety net for the assistant tool guard.
 *
 * The guard denies a command that declares no capabilities, so an untagged
 * registration is a broken command.
 *
 * Two levels assert the same property:
 *  - the structural check walks the command modules and fails when a
 *    `registerCommand` call site carries no capability list;
 *  - the runtime check walks the registry - including the `available: false`
 *    stubs, which stay callable by direct slash input - and fails when a
 *    registered command declares no tags. It needs the registry to expose the
 *    capability map, so it stays skipped until the guard lands.
 */
import { describe, expect, test, } from "bun:test";
import { readdirSync, readFileSync, } from "node:fs";
import { join, } from "node:path";
import "./index";
import * as registry from "./registry";

/** Capability accessors the registry exposes once the guard lands. */
interface CapabilityRegistry {
  listAllCommands?: () => string[];
  getCommandCapabilities?: (name: string,) => string[] | { tags: string[] } | undefined;
}

/** The registry as seen through the capability accessors. */
const capabilities = registry as unknown as CapabilityRegistry;

/** True once the registry exposes the capability map. */
const hasCapabilityApi = typeof capabilities.listAllCommands === "function" &&
  typeof capabilities.getCommandCapabilities === "function";

/**
 * Tags declared for a command, whatever shape the registry returns them in.
 * @param name - Command name
 * @returns Declared capability tags (empty when the command declares none)
 */
const tagsOf = (name: string,): string[] => {
  const entry = capabilities.getCommandCapabilities?.(name,);
  if (!entry) {
    return [];
  }

  return Array.isArray(entry,) ? entry : (entry.tags ?? []);
};

/**
 * Command modules that may register commands. `registry.ts` holds the
 * registration function itself and is not a command module.
 * @returns Absolute paths of the command modules
 */
const commandModules = (): string[] => {
  return readdirSync(import.meta.dir,)
    .filter((file,) => file.endsWith(".ts",) && !file.endsWith(".test.ts",) && file !== "registry.ts")
    .map((file,) => join(import.meta.dir, file,));
};

/**
 * Every command the registry is expected to hold, stubs included. A missing
 * name means a registration was dropped, which the per-command capability
 * check alone cannot see.
 */
const EXPECTED_COMMANDS = [
  "adapt",
  "add",
  "agency",
  "analyze",
  "apply",
  "asset-list",
  "asset-preview",
  "asset-search",
  "attack",
  "battle",
  "caption",
  "char",
  "char-get",
  "char-list",
  "char-update",
  "clone",
  "constraint",
  "context",
  "create",
  "debug",
  "detail",
  "dice",
  "duplicate",
  "evaluate",
  "forage",
  "guide",
  "heal",
  "help",
  "hide",
  "image",
  "impersonate",
  "import",
  "improve",
  "inventory",
  "item-drop",
  "item-get",
  "item-list",
  "item-pickup",
  "item-transfer",
  "item-update",
  "link",
  "loc-get",
  "loc-list",
  "loc-update",
  "modify",
  "music",
  "narrate",
  "ooc",
  "omp",
  "orchestrate",
  "persuade",
  "priority",
  "quest",
  "rag-ask",
  "rag-decompose",
  "rag-preview",
  "rag-search",
  "regen",
  "review",
  "rewrite",
  "roll",
  "scene",
  "sfx",
  "skip",
  "sound",
  "stats",
  "study",
  "sum",
  "summarize",
  "target",
  "tl",
  "translate",
  "video",
  "workflow",
  "workflowz",
  "world-delete",
  "world-get",
  "world-list",
  "world-update",
];

/** Commands registered with `available: false` - still callable by direct input. */
const STUB_COMMANDS = ["sfx", "sound", "music", "video", "image",];

describe("command capability coverage", () => {
  test("every registration site declares a non-empty capability list", () => {
    const problems: string[] = [];
    for (const file of commandModules()) {
      const source = readFileSync(file, "utf8",);
      const registrations = source.match(/registerCommand\(/g,)?.length ?? 0;
      const tagged = source.match(/capabilities:\s*\[\s*"[^"]+"/g,)?.length ?? 0;
      if (tagged < registrations) {
        problems.push(`${file}: ${registrations} registrations, ${tagged} tagged`,);
      }
    }

    expect(problems,).toEqual([],);
  });

  test.skipIf(!hasCapabilityApi,)("every registered command declares a non-empty capability list", () => {
    const names = capabilities.listAllCommands!();
    expect(names.length,).toBeGreaterThan(0,);

    const undeclared = names.filter((name,) => tagsOf(name,).length === 0);
    expect(undeclared,).toEqual([],);
  },);

  test.skipIf(!hasCapabilityApi,)("no expected command is missing from the registry", () => {
    const names = new Set(capabilities.listAllCommands!(),);
    const missing = EXPECTED_COMMANDS.filter((name,) => !names.has(name,));
    expect(missing,).toEqual([],);
  },);

  test.skipIf(!hasCapabilityApi,)("stub commands stay enumerated and tagged", () => {
    const names = capabilities.listAllCommands!();
    for (const stub of STUB_COMMANDS) {
      expect(names,).toContain(stub,);
      expect(tagsOf(stub,).length,).toBeGreaterThan(0,);
    }
  },);

  test.skipIf(!hasCapabilityApi,)("destructive commands carry their irreversible tags", () => {
    expect(tagsOf("world-delete",),).toContain("delete-world",);
    expect(tagsOf("world-delete",),).toContain("irreversible",);
    expect(tagsOf("world-delete",),).toContain("destructive",);
    expect(tagsOf("attack",),).toContain("irreversible",);
  },);
});
