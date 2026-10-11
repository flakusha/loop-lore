// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the plan metadata normalizer.
 *
 * The load-bearing invariants: the two field dialects are recognized
 * and rewritten with the author's value intact; status lines survive
 * untouched; nothing is invented; and a normalized file is a fixed point.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir, } from "node:os";
import path from "node:path";
import { runPlanMetadata, } from "./normalize-plan-metadata";
import {
  classifyProbe,
  decideIndexWrite,
  isLinkedWorktreeFrom,
  probeWorktree,
  type WorktreeProbe,
} from "./plan-index-guard";
import {
  canonicalIndexOrder,
  projectIndex,
} from "./plan-index-projection";
import {
  applyRewrites,
  fieldLines,
  normalizeEpicRef,
  planFile,
  relatedRefs,
  tagsOf,
} from "./plan-markdown-fields";

describe("canonicalIndexOrder", () => {
  test("uses localeCompare order, matching what giwt writes", () => {
    // The real index holds both casings and giwt's localeCompare keeps the
    // lowercase key FIRST (case is a tertiary collation level). The default
    // code-unit sort puts uppercase first and moved it — the spurious reorder
    // this function exists to prevent.
    const index = {
      "BUG-REDOS-IN-A": {},
      "BUG-redos-in-a": {},
      "BUG-REDUNDANT": {},
    };
    expect(Object.keys(canonicalIndexOrder(index,),),).toEqual([
      "BUG-redos-in-a",
      "BUG-REDOS-IN-A",
      "BUG-REDUNDANT",
    ],);
  });

  test("an already-canonical index round-trips unchanged", () => {
    const index = { "BUG-A": {}, "BUG-redos-in-a": {}, "BUG-REDUNDANT": {}, };
    expect(canonicalIndexOrder(index,),).toEqual(index,);
  });

  test("sorting a sorted index is a fixed point", () => {
    const once = canonicalIndexOrder({ "B": {}, "a": {}, "C-1": {}, },);
    expect(canonicalIndexOrder(once,),).toEqual(once,);
  });
});

describe("projectIndex", () => {
  const files: Record<string, string> = {
    ".plan/tickets/BUG-001.md": "**Tags:** chat, bug\n**Epic:** epic-items\n",
    ".plan/tickets/BUG-002.md": "**Status:** Done\n",
    ".plan/tickets/BUG-003.md": "**Tags:** already\n**Epic:** epic-other\n",
    ".plan/tickets/BUG-006.md": "**Tags:** fresh-list\n**Epic:** epic-new\n",
  };
  const read = (src: string,): string | null => files[src] ?? null;
  const index = {
    "BUG-001": { source: ".plan/tickets/BUG-001.md", tags: [], epic: "", },
    "BUG-002": { source: ".plan/tickets/BUG-002.md", tags: [], epic: "", },
    "BUG-003": {
      source: ".plan/tickets/BUG-003.md",
      tags: ["` lines) but are **not** propagated", "fragments", "from prose",],
      epic: "epic-other",
    },
    "BUG-004": { source: ".plan/tickets/BUG-gone.md", tags: [], epic: "", },
    "BUG-005": { source: "", tags: [], epic: "", },
    "BUG-006": { source: ".plan/tickets/BUG-006.md", tags: ["stale",], epic: "epic-old", },
  };

  test("fills empty tags/epic from the .md, counting each", () => {
    const { next, tagsFilled, epicsFilled, } = projectIndex(index, read,);
    expect(next["BUG-001"],).toEqual({
      source: ".plan/tickets/BUG-001.md",
      tags: ["chat", "bug",],
      epic: "epic-items",
    },);
    expect({ tagsFilled, epicsFilled, },).toEqual({ tagsFilled: 3, epicsFilled: 1, },);
  });

  test("leaves a ticket with no tags in the .md untagged — nothing inferred", () => {
    const { next, } = projectIndex(index, read,);
    expect(next["BUG-002"],).toEqual(index["BUG-002"],);
  });

  test("regression: prose-fragment tags scraped by a header-window parse are replaced by the .md list — frontmatter wins", () => {
    const { next, } = projectIndex(index, read,);
    expect(next["BUG-003"],).toEqual({
      source: ".plan/tickets/BUG-003.md",
      tags: ["already",],
      epic: "epic-other",
    },);
  });

  test("epic stays fill-only-empty — a differing epic value is never overwritten", () => {
    const { next, epicsFilled, } = projectIndex(index, read,);
    expect(next["BUG-006"],).toEqual({
      source: ".plan/tickets/BUG-006.md",
      tags: ["fresh-list",],
      epic: "epic-old",
    },);
    expect(epicsFilled,).toBe(1,);
  });

  test("skips an entry whose source is missing or empty", () => {
    const { next, tagsFilled, } = projectIndex(index, read,);
    expect(next["BUG-004"],).toEqual(index["BUG-004"],);
    expect(next["BUG-005"],).toEqual(index["BUG-005"],);
    expect(tagsFilled,).toBe(3,);
  });

  test("is idempotent — a second projection changes nothing", () => {
    const once = projectIndex(index, read,).next;
    const twice = projectIndex(once, read,);
    expect(twice.tagsFilled,).toBe(0,);
    expect(twice.epicsFilled,).toBe(0,);
    expect(twice.next,).toEqual(once,);
  });
});

describe("tagsOf", () => {
  test("splits a comma list and trims", () => {
    expect(tagsOf("**Tags:** chat, bug , mode\n",),).toEqual(["chat", "bug", "mode",],);
  });
  test("an empty Tags line yields no tags", () => {
    expect(tagsOf("**Tags**:\n",),).toEqual([],);
    expect(tagsOf("**Status:** Done\n",),).toEqual([],);
  });
});

describe("relatedRefs", () => {
  const known = new Set(["BUG-002", "epic-items", "FEAT-036",],);

  test("resolves a type-prefixed id against the known slugs", () => {
    expect(relatedRefs("**Related**: FEAT-036, BUG-002.md", known,).refs,).toEqual([
      "FEAT-036",
      "BUG-002.md",
    ],);
  });

  test("reports a ref that names no file instead of guessing", () => {
    expect(relatedRefs("**Related:** BUG-999.md", known,).dangling,).toEqual(["BUG-999.md",],);
  });

  test("prose in the field is not mistaken for a ref", () => {
    const { refs, dangling, } = relatedRefs(
      "**Related:** same telemetry surface, see `src/admin/config-keys.ts:91`",
      known,
    );
    expect(refs,).toEqual([],);
    expect(dangling,).toEqual([],);
  });

  test("a file with no Related line yields nothing", () => {
    expect(relatedRefs("**Status:** Done\n", known,),).toEqual({ refs: [], dangling: [], },);
  });
});
const SLUGS = new Set(["epic-items", "epic-frontend-components", "epic-api-versioning",],);

describe("normalizeEpicRef", () => {
  test("accepts the spellings tickets actually use", () => {
    expect(normalizeEpicRef("epic-items",),).toBe("epic-items",);
    expect(normalizeEpicRef("epic-api-versioning.md",),).toBe("epic-api-versioning",);
    expect(normalizeEpicRef("`epic-items`",),).toBe("epic-items",);
    expect(normalizeEpicRef(".plan/epics/epic-items.md",),).toBe("epic-items",);
    expect(normalizeEpicRef("epic-items.md (MVP Tier 1)",),).toBe("epic-items",);
    expect(normalizeEpicRef("`epic-assistant-creative-studio-workflows` (§7.6)",),).toBe(
      "epic-assistant-creative-studio-workflows",
    );
  });

  test("refuses values that name no single epic", () => {
    // Placeholders and freeform prose are NOT epic references — guessing
    // here is how a wrong binding gets invented.
    expect(normalizeEpicRef("",),).toBeNull();
    expect(normalizeEpicRef("(if applicable)",),).toBeNull();
    expect(normalizeEpicRef("(none)",),).toBeNull();
    expect(normalizeEpicRef("AO NSFW Game Mechanics",),).toBeNull();
    expect(normalizeEpicRef("Epic 26 (Avatar & Expression)",),).toBeNull();
    expect(normalizeEpicRef("proposed:epic-attachment-moderation",),).toBeNull();
    expect(normalizeEpicRef("epic-chat-lifecycle-moderation, epic-assistant-gm-flows",),).toBeNull();
    expect(normalizeEpicRef("epic-items / epic-rpg",),).toBeNull();
  });
});

describe("fieldLines", () => {
  test("reads all three field spellings without eating the closing bold", () => {
    const got = fieldLines(
      ["**Epic:** epic-items", "**Epic**: epic-items", "**Tags:** a, b", "**Labels**: c, d",].join("\n",),
    );
    expect(got.map((f,) => [f.name, f.value,]),).toEqual([
      ["Epic", "epic-items",],
      ["Epic", "epic-items",],
      ["Tags", "a, b",],
      ["Labels", "c, d",],
    ],);
  });

  test("an empty field line yields an empty value, not the next field", () => {
    // The blob-matching bug this guards: giwt's 30-line join reads a
    // `**Related**:` line directly under an empty `**Epic**:` as the
    // epic's value.
    const got = fieldLines(["**Epic**:", "**Related**: FEAT-036",].join("\n",),);
    expect(got.map((f,) => [f.name, f.value,]),).toEqual([["Epic", "",],],);
  });

  test("does not match status or unrelated lines", () => {
    expect(fieldLines("**Status:** Done",).length,).toBe(0,);
    expect(fieldLines("**Summary:** Tags: Labels",).length,).toBe(0,);
  });
});

const FILE = ".plan/tickets/BUG-x.md";

describe("planFile", () => {
  test("promotes a populated **Labels:** line to **Tags:**, value intact", () => {
    const plan = planFile(FILE, "**Labels**: chat, bug, mode\n", SLUGS,);
    expect(plan.rewrites,).toEqual([{
      file: FILE,
      kind: "labels-to-tags",
      from: "**Labels**: chat, bug, mode",
      to: "**Tags**: chat, bug, mode",
    },],);
    expect(plan.hasTags,).toBe(true,);
  });

  test("leaves a placeholder Labels value alone — `(none)` is not a tag", () => {
    const plan = planFile(FILE, "**Labels**: (none)\n", SLUGS,);
    expect(plan.rewrites,).toEqual([],);
    expect(plan.hasTags,).toBe(false,);
  });

  test("canonicalizes the colon-outside Epic spelling so giwt can read it", () => {
    const plan = planFile(FILE, "**Epic**: epic-items\n", SLUGS,);
    expect(plan.rewrites,).toEqual([{
      file: FILE,
      kind: "epic-colon-outside",
      from: "**Epic**: epic-items",
      to: "**Epic:** epic-items",
    },],);
    expect(plan.dangling,).toEqual([],);
  });

  test("does not rewrite an already-canonical Epic line", () => {
    const plan = planFile(FILE, "**Epic:** epic-items\n", SLUGS,);
    expect(plan.rewrites,).toEqual([],);
  });

  test("reports an epic that names no epic file instead of inventing one", () => {
    const plan = planFile(FILE, "**Epic:** epic-does-not-exist\n", SLUGS,);
    expect(plan.rewrites,).toEqual([],);
    expect(plan.dangling,).toEqual([{ file: FILE, value: "epic-does-not-exist", },],);
  });

  test("a file with no tags and no labels stays untagged", () => {
    const plan = planFile(FILE, "**Status:** Done\n**Priority:** high\n", SLUGS,);
    expect(plan.rewrites,).toEqual([],);
    expect(plan.hasTags,).toBe(false,);
  });
});

describe("applyRewrites", () => {
  test("preserves status lines byte-for-byte", () => {
    const text = [
      "**Status:** ✅ Complete",
      "**Priority:** high",
      "**Labels**: chat, bug",
      "**Epic**: epic-items",
      "",
      "Body mentioning **Tags:** in prose.",
    ].join("\n",);
    const plan = planFile(FILE, text, SLUGS,);
    const out = applyRewrites(text, plan.rewrites,);
    expect(out.split("\n",)[0],).toBe("**Status:** ✅ Complete",);
    expect(out.split("\n",)[1],).toBe("**Priority:** high",);
    expect(out.split("\n",)[2],).toBe("**Tags**: chat, bug",);
    expect(out.split("\n",)[3],).toBe("**Epic:** epic-items",);
    // A prose mention in the body is not a header field: untouched.
    expect(out.split("\n",)[5],).toBe("Body mentioning **Tags:** in prose.",);
  });

  test("is idempotent — a normalized file is a fixed point", () => {
    const text = "**Status:** Done\n**Labels**: chat, bug\n**Epic**: epic-items\n";
    const once = applyRewrites(text, planFile(FILE, text, SLUGS,).rewrites,);
    const twice = planFile(FILE, once, SLUGS,).rewrites;
    expect(twice,).toEqual([],);
    expect(applyRewrites(once, twice,),).toBe(once,);
  });
});

/**
 * CLI surface of `bun run plan:metadata` (scripts/plan/normalize-plan-metadata.ts).
 *
 * Resource contract — why this suite is parallel-safe:
 * - DISK: only the NON-MUTATING `--dry-run` / `--json --dry-run` paths are
 *   spawned. The apply path (no `--dry-run`) rewrites `.plan/epics/*.md`,
 *   `.plan/tickets/*.md` and `.plan/tickets/index.json`, so a test that ran it
 *   would race a sibling `bun test` process — and a sibling agent — over the
 *   real plan tree. `--dry-run` reads only.
 * - PROCESS: each case is a spawned child; the script's `import.meta.main`
 *   CLI block and its accumulators are per-invocation.
 * - The JSON payload's counts are NOT pinned to literals — how much drift the
 *   tree holds at any moment is concurrent repo state. What IS pinned is the
 *   shape and the `dryRun` field, which prove the flag reached the writer.
 * - No fixed-path fixtures, no shared globals, no ordering dependence.
 */
describe("normalize-plan-metadata CLI", () => {
  const SCRIPT = path.join(import.meta.dir, "normalize-plan-metadata.ts",);

  test("--help prints the brief and exits 0", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--help",],);
    expect(proc.exitCode,).toBe(0,);
    expect(proc.stdout.toString(),).toContain("Unify .plan header-field dialects",);
  });

  test("--dry-run reports without rewriting", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--dry-run",],);
    const out = proc.stdout.toString();
    expect(out,).toContain("=== Plan metadata normalization ===",);
    expect(out,).toContain("dry-run: true",);
    expect(proc.exitCode,).toBe(0,);
  });

  test("--json --dry-run emits parseable JSON with dryRun true", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--json", "--dry-run",],);
    const payload = JSON.parse(proc.stdout.toString(),) as { dryRun: boolean };
    // dryRun: false here would mean --dry-run was dropped and the tree was
    // rewritten before the report was printed.
    expect(payload.dryRun,).toBe(true,);
    expect(proc.exitCode,).toBe(0,);
  });

  test("an unknown option is rejected with exit 1", () => {
    const proc = Bun.spawnSync(["bun", SCRIPT, "--no-such-flag",],);
    expect(proc.exitCode,).toBe(1,);
  });
});

/**
 * The linked-worktree guard — the decision that decides whether
 * `.plan/tickets/index.json` is written at all, plus the write-ordering
 * invariant that a malformed index leaves the tree untouched.
 *
 * Every assertion here is about the DECISION (`decision`, the bytes on disk,
 * what the operator is told), never about a value merely being non-empty.
 *
 * Resource contract — what each case OWNS, and why it is parallel-safe:
 * - DISK (unique): every case builds its own `mkdtemp` root under the OS temp
 *   dir and owns it exclusively; no fixed-path fixture, and the repo's real
 *   `.plan/` is never read or written, so this suite cannot race a sibling
 *   `bun test` or a sibling agent over the plan tree.
 * - DISK (teardown): each root is registered on creation and removed in the
 *   `afterEach` below, which runs even when the case fails — a leaked root
 *   cannot poison the next case or grow the tmpdir across a parallel run.
 * - PROCESS: `runPlanMetadata` is called in-process with the probe injected, so
 *   no git subprocess and no CLI/global state is shared between cases. The one
 *   case that does spawn git passes a path that does not exist.
 * - ORDER: no shared mutable state; every assertion reads only its own root.
 */
describe("index.json write guard", () => {
  const TICKET = "# BUG-x\n\n**Labels:** alpha, beta\n**Epic**: epic-items\n";
  const INDEX = JSON.stringify({ "BUG-x": { source: ".plan/tickets/BUG-x.md", tags: [], epic: "", }, }, null, 2,) +
    "\n";
  const MAIN: WorktreeProbe = { ok: true, dirs: [".git", ".git",], };
  const LINKED: WorktreeProbe = { ok: true, dirs: ["/repo/.git/worktrees/wt", "/repo/.git",], };
  const BROKEN: WorktreeProbe = { ok: false, reason: "git rev-parse exited 128: detected dubious ownership", };

  const mdPath = (root: string,): string => path.join(root, ".plan", "tickets", "BUG-x.md",);
  const indexPath = (root: string,): string => path.join(root, ".plan", "tickets", "index.json",);

  const ownedRoots: string[] = [];
  afterEach(() => {
    for (const root of ownedRoots.splice(0,)) {
      rmSync(root, { recursive: true, force: true, },);
    }
  },);

  /** Register a temp root so the `afterEach` above reclaims it, pass or fail. */
  function own(root: string,): string {
    ownedRoots.push(root,);
    return root;
  }

  function fixture(index: string | null,): string {
    const root = own(mkdtempSync(path.join(tmpdir(), "plan-meta-guard-",),),);
    mkdirSync(path.join(root, ".plan", "epics",), { recursive: true, },);
    mkdirSync(path.join(root, ".plan", "tickets",), { recursive: true, },);
    writeFileSync(mdPath(root,), TICKET,);
    if (index !== null) { writeFileSync(indexPath(root,), index,); }
    return root;
  }

  function run(root: string, probe: WorktreeProbe, dryRun = false,) {
    const out: string[] = [];
    const err: string[] = [];
    const result = runPlanMetadata(root, {
      dryRun,
      json: false,
      probe,
      log: (line,) => {
        out.push(line,);
      },
      warn: (line,) => {
        err.push(line,);
      },
    },);
    return { result, out: out.join("\n",), err: err.join("\n",), };
  }

  // ── pure predicate ───────────────────────────────────────────────────────

  test("a normal checkout (git-dir == git-common-dir) is not a linked worktree", () => {
    expect(isLinkedWorktreeFrom([".git", ".git",],),).toBe(false,);
  });

  test("two differing git dirs are a linked worktree", () => {
    expect(isLinkedWorktreeFrom(["/repo/.git/worktrees/wt", "/repo/.git",],),).toBe(true,);
  });

  test("probe output that is not two lines is not a linked-worktree verdict", () => {
    expect(isLinkedWorktreeFrom([],),).toBe(false,);
    expect(isLinkedWorktreeFrom([".git",],),).toBe(false,);
  });

  // ── the write decision ───────────────────────────────────────────────────

  const MAIN_CHECKOUT = { dirs: [".git", ".git",], indexChanged: true, want: "write", };
  const LINKED_WORKTREE = {
    dirs: ["/repo/.git/worktrees/wt", "/repo/.git",],
    indexChanged: true,
    want: "skip-linked-worktree",
  };
  const PROBE_FAILED = { dirs: null, indexChanged: true, want: "skip-probe-failed", };

  for (const row of [MAIN_CHECKOUT, LINKED_WORKTREE, PROBE_FAILED,]) {
    const label = row.dirs === null ? "a probe that failed" : `dirs ${JSON.stringify(row.dirs,)}`;
    test(`write authorization for ${label} is ${row.want}`, () => {
      const probe: WorktreeProbe = row.dirs === null
        ? { ok: false, reason: "git rev-parse exited 128", }
        : { ok: true, dirs: row.dirs, };
      expect(decideIndexWrite(probe, row.indexChanged, false,),).toBe(row.want,);
    });
  }

  // ── the probe's own shape is a verdict, not a default ─────────────────────

  test("classifyProbe: two paths is the only shape that authorizes anything", () => {
    const main = classifyProbe({ exitCode: 0, stdout: ".git\n.git\n", stderr: "", },);
    const linked = classifyProbe({ exitCode: 0, stdout: "/r/.git/worktrees/w\n/r/.git\n", stderr: "", },);
    expect(main.ok,).toBe(true,);
    expect(linked.ok,).toBe(true,);
    expect(decideIndexWrite(main, true, false,),).toBe("write",);
    expect(decideIndexWrite(linked, true, false,),).toBe("skip-linked-worktree",);
  });

  test("classifyProbe: a shape that is not two paths fails CLOSED", () => {
    // A truncated pipe, a `git` wrapper that prints usage, or an empty answer
    // would all read as "not a linked worktree" and authorize the write.
    for (const stdout of ["", "\n", ".git\n", "a\nb\nc\n", "usage: git rev-parse\n",]) {
      const probe = classifyProbe({ exitCode: 0, stdout, stderr: "", },);
      expect(probe.ok,).toBe(false,);
      if (probe.ok) { throw new Error("unreachable — the assertion above failed",); }
      expect(probe.reason,).toContain("unexpected git rev-parse output",);
      expect(decideIndexWrite(probe, true, false,),).toBe("skip-probe-failed",);
    }
  });

  test("classifyProbe: a non-zero exit fails closed and names the exit and stderr", () => {
    const probe = classifyProbe({ exitCode: 128, stdout: "", stderr: "detected dubious ownership", },);
    expect(probe.ok,).toBe(false,);
    if (probe.ok) { throw new Error("unreachable — the assertion above failed",); }
    expect(probe.reason,).toContain("exited 128",);
    expect(probe.reason,).toContain("dubious ownership",);
    expect(decideIndexWrite(probe, true, false,),).toBe("skip-probe-failed",);
  });

  test("a failed probe never authorizes the write, whatever the probe reason", () => {
    for (const reason of ["git could not be run: ENOENT", "git rev-parse exited 128: dubious ownership", "",]) {
      expect(decideIndexWrite({ ok: false, reason, }, true, false,),).toBe("skip-probe-failed",);
    }
  });

  test("dry-run and no-op projection never write", () => {
    expect(decideIndexWrite(MAIN, true, true,),).toBe("skip-dry-run",);
    expect(decideIndexWrite(MAIN, false, false,),).toBe("skip-no-change",);
  });

  // ── end to end: the write, or the refusal ────────────────────────────────

  test("main checkout: index.json IS written and backfilled", () => {
    const root = fixture(INDEX,);
    const { result, } = run(root, MAIN,);
    expect(result.index.decision,).toBe("write",);
    expect(result.index.written,).toBe(true,);
    const onDisk = JSON.parse(readFileSync(indexPath(root,), "utf8",),) as Record<
      string,
      { tags: string[]; epic: string }
    >;
    expect(onDisk["BUG-x"]!.tags,).toEqual(["alpha", "beta",],);
  });

  test("linked worktree: index.json is NOT written and the notice IS printed", () => {
    const root = fixture(INDEX,);
    const { result, out, err, } = run(root, LINKED,);
    expect(result.index.decision,).toBe("skip-linked-worktree",);
    expect(result.index.written,).toBe(false,);
    // the bytes on disk are the guard's real invariant, not the return value
    expect(readFileSync(indexPath(root,), "utf8",),).toBe(INDEX,);
    expect(out,).toContain("NOT WRITTEN",);
    expect(err,).toBe("",);
  });

  test("failed probe: index.json is NOT written and the cause is surfaced LOUDLY", () => {
    const root = fixture(INDEX,);
    const { result, out, err, } = run(root, BROKEN,);
    // Fail closed: a probe that could not run must not read as "main checkout".
    expect(result.index.decision,).toBe("skip-probe-failed",);
    expect(result.index.written,).toBe(false,);
    expect(readFileSync(indexPath(root,), "utf8",),).toBe(INDEX,);
    // …and the operator must not be handed a clean unqualified count.
    expect(err,).toContain("could NOT verify the worktree layout",);
    expect(err,).toContain("dubious ownership",);
    expect(out,).toContain("NOT WRITTEN",);
  });

  test("a failed probe is reported even when there was nothing to write", () => {
    const root = fixture(
      JSON.stringify(
        { "BUG-x": { source: ".plan/tickets/BUG-x.md", tags: ["alpha", "beta",], epic: "epic-items", }, },
        null,
        2,
      ),
    );
    const { result, err, } = run(root, BROKEN,);
    expect(result.index.tagsFilled + result.index.epicsFilled,).toBe(0,);
    expect(result.index.decision,).toBe("skip-no-change",);
    expect(err,).toContain("could NOT verify the worktree layout",);
  });

  test("dry-run writes nothing in the main checkout", () => {
    const root = fixture(INDEX,);
    const { result, } = run(root, MAIN, true,);
    expect(result.index.decision,).toBe("skip-dry-run",);
    expect(readFileSync(indexPath(root,), "utf8",),).toBe(INDEX,);
    expect(readFileSync(mdPath(root,), "utf8",),).toBe(TICKET,);
  });

  // ── the real subprocess, failing for real ────────────────────────────────

  test("probeWorktree reports a failure instead of a clean checkout", () => {
    const missing = path.join(own(mkdtempSync(path.join(tmpdir(), "plan-meta-probe-",),),), "no-such-dir",);
    const probe = probeWorktree(missing,);
    expect(probe.ok,).toBe(false,);
    if (probe.ok) { throw new Error("unreachable — the assertion above failed",); }
    expect(probe.reason,).toContain("exited",);
    expect(decideIndexWrite(probe, true, false,),).toBe("skip-probe-failed",);
  });

  // ── write ordering: a malformed index must not half-mutate ───────────────

  test("a malformed index aborts the run with the .md files untouched", () => {
    const conflicted =
      '{\n<<<<<<< HEAD\n  "BUG-x": {},\n=======\n  "BUG-x": { "source": ".plan/tickets/BUG-x.md" },\n>>>>>>> dev\n}\n';
    const root = fixture(conflicted,);
    const quiet = { log: (): void => {}, warn: (): void => {}, };
    expect(() => runPlanMetadata(root, { dryRun: false, json: false, probe: MAIN, ...quiet, },)).toThrow();
    // The invariant: a run that dies on the index must not have already
    // rewritten the plan markdown — that half-applied state was
    // indistinguishable from a failed no-op at the terminal.
    expect(readFileSync(mdPath(root,), "utf8",),).toBe(TICKET,);
    expect(readFileSync(indexPath(root,), "utf8",),).toBe(conflicted,);
  });

  test("a missing index degrades: the markdown pass still runs", () => {
    const root = fixture(null,);
    const { result, } = run(root, MAIN,);
    expect(result.index.decision,).toBe("skip-no-index",);
    expect(result.filesChanged,).toBe(1,);
    expect(readFileSync(mdPath(root,), "utf8",),).toContain("**Tags:**",);
  });
});
