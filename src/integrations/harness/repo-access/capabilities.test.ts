// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// repo-access/capabilities.test.ts — the capability vocabulary freeze + the
// fail-closed narrow. Parallel-safe: pure functions, no IO, no ports.
import { describe, expect, it, } from "bun:test";
import {
  HARNESS_REPO_CAPABILITIES,
  toRepoCapability,
} from "./capabilities";

describe("HARNESS_REPO_CAPABILITIES — the epic vocabulary", () => {
  it("carries exactly the six epic capabilities, repo:read pruned", () => {
    expect([...HARNESS_REPO_CAPABILITIES,],).toEqual([
      "repo:write",
      "worktree:spawn",
      "check:run",
      "commit:signed",
      "finalize:merge",
      "ticket:ops",
    ],);
  });

  it("never contains the pruned repo:read (implied by worktree access)", () => {
    expect(HARNESS_REPO_CAPABILITIES.includes("repo:read" as never,),).toBe(false,);
  });
});

describe("toRepoCapability — fail-closed narrow", () => {
  it("narrows every vocabulary member", () => {
    for (const cap of HARNESS_REPO_CAPABILITIES) {
      expect(toRepoCapability(cap,),).toBe(cap,);
    }
  });

  it("narrows junk to null — never a guessed capability", () => {
    expect(toRepoCapability("repo:read",),).toBeNull();
    expect(toRepoCapability("repo.write",),).toBeNull();
    expect(toRepoCapability("REPO:WRITE",),).toBeNull();
    expect(toRepoCapability("finalize",),).toBeNull();
    expect(toRepoCapability("",),).toBeNull();
    expect(toRepoCapability("repo:write ",),).toBeNull();
  });
});
