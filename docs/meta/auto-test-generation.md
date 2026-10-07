<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Automatic Test Generation

> **Branch:** `feat-auto-test-generation`
> **Question:** what can generate our tests for us, and can generated code constrain itself?
> **Status:** mapper and gap ratchet shipped on this branch; the test-file generator they feed is the
> next slice. Mutation testing and API-contract fuzzing are deferred.

Three parallel scouts surveyed coverage-guided synthesis, fuzz/property input generation, and the
integration boundaries worth property-testing. This document is the synthesis: what exists, what was
rejected, what this branch builds, and what to attack next. It stands alone — no need to read the
scout notes.

---

## 1. Problem

The repo enforces an 80% per-module line-coverage floor and a 95% type-coverage floor. Both answer the
same question — *how much of this file executed* — and neither answers the one that matters when a
reviewer asks "is this tested?". A module can sit at its floor while a single exported predicate that
three call sites depend on has never been invoked by anything. Line coverage has no vocabulary for
"never called": an unexecuted line and an unexecuted function are the same number, and neither is
distinguished from a line that is unreachable on purpose. Meanwhile nothing in the toolchain writes a
single test — every case in `src/**/*.test.ts` is hand-written, so the schema-shaped surface (route
bodies, config schemas, DB column shapes) is tested only where a human remembered to sample it. The
result is a repo that is *quantitatively covered and structurally untested*, and no existing gate can
tell the difference. Closing that needs two things the ecosystem does not currently ship for
TypeScript/Bun: a generator that derives test inputs from the schemas the code already declares, and a
ratchet that fails when the set of never-referenced exports grows.

---

## 2. Existing approaches surveyed

| Approach | Tool | TypeScript/Bun support | Verdict |
| --- | --- | --- | --- |
| Coverage-guided test synthesis | [Diffblue Cover](https://www.diffblue.com/diffblue-cover) | None — Java/JVM bytecode only | Dead end |
| Coverage-guided test synthesis | [PITest](https://pitest.org/quickstart/basic_concepts/) | None — Java/JVM bytecode only | Dead end as a tool; its *technique* is the transferable idea (below) |
| Mutation testing | [StrykerJS](https://stryker-mutator.io/docs/stryker-js/introduction/) + [`stryker-mutator-bun-runner`](https://www.npmjs.com/package/stryker-mutator-bun-runner) | Yes — an official Bun runner | Opt-in later, once line coverage has stabilized |
| Property testing | [fast-check](https://fast-check.dev/docs/tutorials/setting-up-your-test-environment/property-based-testing-with-bun-test-runner) | Yes — runner-agnostic, runs under `bun test` via `fc.assert` | **Adopted** |
| Schema → arbitrary bridge | [`@fast-check/typebox`](https://fast-check.dev/docs/ecosystem) | Does not exist | Hand-build the bridge |
| Schema → arbitrary bridge | [`json-schema-fast-check`](https://github.com/meeshkan/json-schema-fast-check) | Archived, unmaintained | Dead end |
| Schema → arbitrary bridge | [`zod-fast-check`](https://www.npmjs.com/package/zod-fast-check) | Archived; Zod, not TypeBox | Dead end |
| Data factories vs fuzzers | [`json-schema-faker`](https://github.com/json-schema-faker/json-schema-faker) | Runs under Bun, but emits **valid** data only | Not a fuzzer — cannot probe a validator's reject path |
| Arbitrary derivation | [effect `Schema.toArbitrary`](https://effect.website/docs/v4/schema/arbitrary) | Real mechanism, wrong schema language | See tradeoff below |
| API contract fuzzing | [Schemathesis](https://schemathesis.io/) | Python sidecar; consumes OpenAPI (this repo has `@elysia/openapi`) | Real but heavyweight — deferred |
| Static untested-export detection | [`ts-morph`](https://ts-morph.com/) (wraps the TypeScript compiler API) | Yes | **Not used** — a regex scan sufficed for a ratchet gate (below) |

**Why fast-check wins.** It is runner-agnostic: `fc.assert(fc.property(...))` throws on failure, which
is all `bun test` needs, so no connector or shim is required. The decisive feature is **shrinking plus
`{ seed, path }` replay**. A failing property is automatically reduced to a minimal counterexample and
reproduced exactly from the printed `{ seed, path }` pair. A hand-rolled generator with a seeded PRNG
is roughly the same line count, but it has no shrinking — so every failure arrives as a large random
blob that a human must minimize by hand, forever. That maintenance cost, not the dependency, is why
the hand-rolled option was rejected.

**Why the TypeBox bridge is hand-built.** No package connects TypeBox to fast-check. The two
JSON-Schema-shaped bridges that once existed are archived, and the Zod one solves a different schema
language. `fast-check` is now a devDependency and `src/test-utils/schema-arbitrary.ts` owns the
mapping, which means the mapper covers exactly the schema subset this repo emits and can be corrected
against real Elysia output (see §4) rather than against a spec nobody here writes.

**The effect `Schema.toArbitrary` tradeoff.** This is a genuine mechanism and `effect` is already a
dependency — on paper it is free. It is still the wrong call here: our schemas are TypeBox, so every
test would have to route TypeBox → effect Schema → arbitrary. That converter is the same
problem as the mapper we would write directly, except with an extra hop, an untyped intermediate, and
a second set of type semantics to keep in sync. The tradeoff flips the moment schemas are effect
Schemas: then `Schema.toArbitrary` is strictly better than maintaining a mapper.

**Text scan, not a compiler-API walk.** `scripts/check/test-gaps.mjs` regex-matches top-level
export declarations (`export function` / `export const` / `export class` / `export enum` / `export let` /
`export var` / `export abstract class`) in `src/**/*.ts`, then asks whether any test file **imports**
that symbol — from an import specifier, resolving directory imports against their `index.ts` — rather
than merely by the name appearing somewhere in the file. No ts-morph, no TypeScript compiler API, no
new dependency. A ts-morph AST walk was the alternative on the table: it would have been more precise,
but it buys precision this use does not need — the output is a *ratchet* over a set of gap keys, not
a proof of coverage — while costing a new dependency, a program-construction step, and a full parse of
the whole tree on every gate run.

The first version of this gate matched on *any identifier token* in the test corpus and passed review
with a fully green suite. Adversarially re-tested, it was toothless for exactly the names new code is
most likely to use: a module exporting `get`, `run`, `parse`, `validate`, `load`, `save` and eight more,
with zero tests, exited 0 — because those names appear somewhere in the test corpus incidentally, or
as an unrelated object's member. Stripping comments and string literals recovered part of it;
requiring a real import edge recovered the rest, on the order of several hundred false negatives
across the tree.

That is worth stating as the lesson rather than as the fix. **A scan whose result is reported as
complete while being computed over a subset is worse than no scan**, because it converts an absence
into false confidence — the exact failure the gate exists to prevent. A green fuzz or coverage gate
that silently covers part of its intended surface is not a partial success; it is an active hazard,
because it retires the reason anyone would otherwise have looked.

The remaining imprecision is real and worth stating plainly. Name collisions across modules, aliased
imports, and dynamically accessed or re-exported symbols are counted imperfectly — the gate cannot
tell "this name appears in a test file" apart from "this specific binding was exercised". It also
deliberately skips shapes it cannot name confidently: `export default`, `export { a, b } from "…"`
re-export lists, and the second name of a multi-declarator `export const a = 1, b = 2`. That is why
the gate **ratchets on a baseline rather than failing on absolute truth**: a set that only ever shrinks
cannot be destabilised by a heuristic mis-reading, because every mis-reading is stable across runs and
simply sits in the baseline until a test removes it. Because the matcher now requires an import edge,
the signal is trustworthy enough to enforce, so the gate runs blocking, and `--write-baseline` refuses
to grow the set without an explicit `--accept-new-debt` so new debt cannot be absorbed by accident. An
AST-precise version would be the right upgrade if the gate ever needs to answer a question other than
"did this set grow?".

---

## 3. What this branch builds

### (a) Schema → arbitrary mapper

`src/test-utils/schema-arbitrary.ts` maps a TypeBox/JSON-Schema node to a `fast-check` arbitrary that
**only produces schema-valid values, by construction**. There is no generate-then-validate pass: the
arbitrary *is* the constraint, so a passing `Value.Check` is a statement about the mapper and a
failing one names the mapper branch that is wrong. The module exports three functions:

- `isTypeBoxSchema(value: unknown): value is TSchema` — narrows an unknown barrel export to a schema
  object, so a consumer can walk a module's exports without importing them eagerly.
- `schemaToArbitrary(schema: TSchema): fc.Arbitrary<unknown>` — the recursive mapper. It honours
  `enum`, `const`, `minimum`/`maximum`, `minLength`/`maxLength`, `minItems`/`maxItems`, `properties`
  plus `required`, `anyOf`/`oneOf`, and the `uuid`/`email`/`date-time` formats. `t.Optional(x)` is not a
  wrapper node — it removes the key from `required` — so optional properties map to an optional
  arbitrary rather than a nested one.
- `isJsonRoundTrippable(schema: TSchema): boolean` — false when the tree contains a `t.Date()` branch,
  and false for bare `date-time`/`date` strings, which no longer compare deep-equal after a
  `JSON.stringify`/parse cycle. A round-trip property built from such a schema would fail for a reason
  that has nothing to do with the code under test.

`scripts/generate-schema-fuzz.ts` walks the schema-bearing modules and emits a real test file rather
than a report — a co-located `*.test.ts` following the repo's existing conventions. Each emitted
property asserts that values from `schemaToArbitrary` pass `Value.Check`, and that round-trippable
schemas survive `JSON.stringify` → `JSON.parse` deep-equality. Every property runs at a fixed seed,
so a failure is reproducible and the suite cannot flake on a lucky draw.

**Discovery is directory-based, not barrel-based.** The generator globs `src/validation/schemas/*.ts`
on disk and merges each module's namespace, rather than reading the exports of the barrel in that
directory. This was not the original design: the first version iterated the barrel only, and four
modules sitting beside it (`responses`, `responses-admin`, `responses-interaction`, `music-links`)
are not re-exported from it. Forty-one schemas — validated by live routes and frontend modules — were
therefore never fuzzed, while the gate cheerfully reported a clean count and exited 0. Reading the
directory makes it structurally impossible for a new module to be missed.

Schemas whose name repeats across modules are disambiguated by the module that owns them, so a
generated `test()` always exercises the right one rather than silently collapsing onto whichever was
imported first.

**One `test()` per schema, not one loop over schemas.** A loop is dramatically shorter to write and
strictly worse to debug: when the property fails, the failure message says *"counterexample found"*
and nothing else. Across a whole barrel of schemas, you then have to re-run with narrowing, or bisect,
to learn which one broke — and the answer is always "some schema", which is not actionable. One
named `test()` per schema makes the failing case self-identifying: the runner prints the schema's own
name. The extra lines are the entire value of the mechanism.

### (b) Test-gap ratchet

`scripts/check/test-gaps.mjs` computes the set of exported symbols in non-test `src/` files that no
`src/**/*.test.ts` mentions, and fails when that set **grows**. The current set is committed to
`scripts/check/test-gaps-baseline.json` as `<file>#<symbol>` keys, in the same shape as the existing
jscpd clone ratchet. In gate mode it prints every gap absent from the baseline and exits nonzero;
`--write-baseline` rewrites the file with the current set. Generated, machine-owned files — the DB
schema manifest, migrations, `insert-helpers.ts`, `db-schemas.ts` — are excluded from the scan, since
"add a test naming this export" is not an actionable answer for a file regenerated wholesale.

Note that `--write-baseline` is deliberately unguarded. It lowers the baseline when gaps have been
closed, and it will also raise it if a refactor renames or removes exports the baseline recorded. That
is the one place a reviewer must read the diff rather than rubber-stamp it.

Ratchet semantics matter more than the detection itself. A fixed "must test everything" rule is
unlandable — it fails on every new export and gets disabled within a week. Failing only on *growth*
means new code arrives tested, existing debt stays visible in the baseline instead of blocking work,
and the debt can only shrink through deliberate updates. This is the cheapest gate that changes
behavior: it adds no new coverage requirement, only a new one on the set of never-referenced exports.

---

## 4. The Elysia coercion-branch trap

This is the most repo-specific finding in the survey, and the mapper is wrong without it.

Elysia's `t` schemas compile to plain JSON Schema objects, but `t.Integer` and `t.Numeric` compile to
a **two-branch `anyOf`** — one branch for the number, one for the string a request body might carry
before coercion:

```jsonc
// t.Integer({ minimum: 0, maximum: 5 })
{ "anyOf": [
    { "type": "string", "format": "integer" },
    { "type": "integer", "minimum": 0, "maximum": 5 }
] }

// t.Numeric({ minimum: 1 })
{ "anyOf": [
    { "type": "string", "format": "numeric" },
    { "type": "number", "minimum": 1 }
] }
```

A mapper that treats `anyOf` as "pick a branch uniformly" — the obvious reading, and what any
generic JSON-Schema→arbitrary mapper does — emits a string roughly half the time. That value then
fails the integer check the schema is named for, and the generated property test fails on
well-formed input. The failure looks like a mapper bug and is actually a schema-reading bug.

**The mapper therefore drops the string-coercion branch** and generates only the non-string branch of
any `anyOf` whose string members are Elysia's coercion forms (`format: "integer"` / `format: "numeric"`).
The request-coercion behavior those branches describe is real and belongs tested — but in a coercion
test that feeds a *known* string and asserts the coerced output, not in a round-trip property that
claims every generated value is already an integer. `t.Date()` has the same shape
(`anyOf: [{ "type": "Date" }, date-time string, date string, number]`) and is handled separately by
`isJsonRoundTrippable`.

The general lesson: Elysia output is JSON Schema *plus* a coercion convention layered on top, and a
generic JSON-Schema mapper silently gets that convention wrong. Every branch decision in the mapper is
therefore justified against real `t` output, not against the spec.

---

## 5. Surfaces worth property-testing next

Ranked by risk-to-cost, drawn from the integration-surface survey. These are the boundaries where a
single adversarial input class breaks something silently.

1. **Regex action-parser stage 1** — `src/regex/action-parser.ts`, `parseActionStage1`. Highest risk,
   lowest cost: an untested regex extractor with no empty-match, no-article, hyphenated,
   apostrophe, or minimum-length cases.
   *Invariant:* for a phrase containing verb `v`, `parseActionStage1(phrase).verb === v`; and
   `extractTarget` output length always lands in the documented target-length range for every input
   it returns non-null for.

2. **State machines** — `turnStatusMachine` (`src/db/turns.ts`), `questStatusMachine` and
   `questProgressStatusMachine` (`src/db/quests.ts`), plus the message status/visibility machines.
   The character state machine is already exhaustively tested; these are not.
   *Invariant:* `canTransition(a, b)` agrees with whether `transition(a, b)` throws, for every state
   pair; `isTerminal(s)` holds exactly when `s` has no outgoing transitions; and every non-terminal
   state reaches a terminal state.

3. **`db-schemas.ts` insert/read round-trip** — the schema manifest is checked against the migration
   set, but no test inserts a generated row and reads it back.
   *Invariant:* a payload built from the schema's own arbitrary, inserted through Kysely and re-read,
   comes back deep-equal to what was inserted.

4. **Validation schema boundary** — schemas under `src/validation/schemas/` are covered by
   hand-written literals only.
   *Invariant:* `Value.Check` accepts every value from `schemaToArbitrary` for that schema — the same
   property the generated tests assert, extended to the schemas that were skipped.

5. **Composite status/visibility validators** — `messagesStatusVisibility` and
   `questProgressValidator` combine several fields and are untested.
   *Invariant:* a composite validator never returns a violation for a payload whose individual field
   schemas all pass; and it does return one whenever a required sub-field is dropped.

6. **Crypto payload predicate** — `isEncryptedPayload` in the compress-then-encrypt pipeline has no
   dedicated test, though the surrounding pipeline is well covered.
   *Invariant:* `isEncryptedPayload(v)` is true exactly when `decryptThenDecompress(v, key)` does not
   throw.

Content encode/decode and the crypto round-trip are already property-equivalent via their existing
tests and are deliberately excluded.

---

## 6. Rejected and why

- **StrykerJS** — deferred, not rejected: it has a real official Bun runner, but a mutation score
  measured under a thin coverage baseline is noise, and each mutant costs a full test run.
- **Schemathesis** — deferred: Python sidecar, needs a live server and a CI step; correct for
  intersystem API testing but disproportionate until route annotations and the OpenAPI spec stabilize.
- **`json-schema-faker`** — rejected: emits valid data only, so it cannot probe a validator's reject
  path. A factory, not a fuzzer.
- **`ts-morph`** — rejected: a compiler-API walk was considered and not used. A regex export scan
  covers the whole `src/**/*.ts` tree with no new dependency and no program construction, which is the
  right trade for a baseline ratchet whose output is a shrinking set of keys.
- **Diffblue Cover / PITest** — rejected: Java only. PITest's coverage-guided mutant selection remains
  worth reading as a technique; the tools themselves are inapplicable to a Bun/TypeScript repo.
