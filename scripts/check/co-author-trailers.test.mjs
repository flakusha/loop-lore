// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Pins the verdict boundary of the co-author trailer check: only a total miss
// on the identity population is a finding. A trailer matching the repo
// identity, another real author, its own commit, or an ALLOWED_TRAILERS
// consent must pass — an over-eager check blocks legitimate attribution, and
// a lax one is the defect this gate exists for.

import { expect, test, } from "bun:test";
import { auditCommits, } from "./co-author-trailers.mjs";

const population = {
  emails: new Map([
    ["zenflak@gmail.com", "Konstantin Fedotov <zenflak@gmail.com>",],
    ["jane@example.com", "Jane Doe <jane@example.com>",],
  ],),
  allowed: ["bot@corp.example",],
};

function commit(message, ident = "Konstantin Fedotov <zenflak@gmail.com>",) {
  return { sha: "abc123def456", ident, committer: ident, message, };
}

test("a message with no trailers is clean", () => {
  expect(auditCommits([commit("chore: thing\n\nbody\n",),], population,),).toEqual([],);
});

test("a trailer naming another real author passes", () => {
  expect(
    auditCommits([commit("chore: t\n\nCo-Authored-By: Jane Doe <jane@example.com>\n",),], population,),
  ).toEqual([],);
});

test("a trailer naming the repo identity passes (the (Agent) name shape too)", () => {
  expect(
    auditCommits(
      [commit("chore: t\n\nCo-Authored-By: Konstantin Fedotov (Agent) <zenflak@gmail.com>\n",),],
      population,
    ),
  ).toEqual([],);
});

test("a trailer matching the commit's own author passes", () => {
  const other = "Someone Else <other@example.com>";
  expect(auditCommits([commit("chore: t\n\nCo-Authored-By: X <x@example.com>\n", other,),], {
    emails: new Map([["x@example.com", "X",],],),
    allowed: [],
  },),).toEqual([],);
});

test("an ALLOWED_TRAILERS consent keeps an otherwise unknown trailer", () => {
  expect(
    auditCommits([commit("chore: t\n\nCo-Authored-By: Corp Bot <bot@corp.example>\n",),], population,),
  ).toEqual([],);
});

test("Signed-off-by and Reviewed-by are not this check's business", () => {
  expect(
    auditCommits(
      [commit(
        "chore: t\n\nSigned-off-by: Nobody <nobody@nowhere.invalid>\nReviewed-by: Also Nobody <ghost@example.invalid>\n",
      ),],
      population,
    ),
  ).toEqual([],);
});

test("a fabricated identity is flagged with its sha and subject", () => {
  const findings = auditCommits(
    [commit("fix: thing\n\nCo-Authored-By: omp-agent <omp-agent@localhost>\n",),],
    population,
  );
  expect(findings,).toHaveLength(1,);
  expect(findings[0].email,).toBe("omp-agent@localhost",);
  expect(findings[0].sha,).toBe("abc123def456",);
  expect(findings[0].subject,).toBe("fix: thing",);
});

test("every offending trailer is reported, not just the first", () => {
  const findings = auditCommits(
    [commit(
      "fix: t\n\nCo-Authored-By: a <a@nowhere.invalid>\nCo-Authored-By: Jane Doe <jane@example.com>\nCo-Authored-By: b <b@nowhere.invalid>\n",
    ),],
    population,
  );
  expect(findings.map((f,) => f.email),).toEqual([
    "a@nowhere.invalid",
    "b@nowhere.invalid",
  ],);
});

test("a trailer with no email at all is skipped, not flagged", () => {
  expect(auditCommits([commit("chore: t\n\nCo-Authored-By: archivist-agent\n",),], population,),)
    .toEqual([],);
});

test("email is the key: same email under any name passes", () => {
  expect(
    auditCommits([commit("chore: t\n\nCo-Authored-By: Wrong Name <jane@example.com>\n",),], population,),
  ).toEqual([],);
});
