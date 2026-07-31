import { describe, expect, it, } from "bun:test";
import { CONVENTIONAL_COMMIT, RELEASE_BRANCH, SEMVER, } from "./commit";

describe("commit regex", () => {
  describe("CONVENTIONAL_COMMIT", () => {
    it.each([
      ["feat: add new feature", { type: "feat", scope: undefined, breaking: undefined, subject: "add new feature", },],
      ["fix(auth): resolve login bug", {
        type: "fix",
        scope: "auth",
        breaking: undefined,
        subject: "resolve login bug",
      },],
      ["refactor!: breaking change", {
        type: "refactor",
        scope: undefined,
        breaking: "!",
        subject: "breaking change",
      },],
      ["feat(db)!: redesign schema", { type: "feat", scope: "db", breaking: "!", subject: "redesign schema", },],
      ["chore: update deps", { type: "chore", scope: undefined, breaking: undefined, subject: "update deps", },],
    ],)("parses '%s'", (input, expected,) => {
      const match = CONVENTIONAL_COMMIT.exec(input,);
      expect(match,).not.toBeNull();
      expect(match?.[1],).toBe(expected.type,);
      expect(match?.[2],).toBe(expected.scope,);
      expect(match?.[3],).toBe(expected.breaking,);
      expect(match?.[4],).toBe(expected.subject,);
    },);

    it("returns null for invalid commits", () => {
      expect(CONVENTIONAL_COMMIT.exec("not a commit",),).toBeNull();
      expect(CONVENTIONAL_COMMIT.exec("",),).toBeNull();
    });
  });

  describe("SEMVER", () => {
    it.each([
      ["1.0.0", { major: "1", minor: "0", patch: "0", prerelease: undefined, },],
      ["2.3.4", { major: "2", minor: "3", patch: "4", prerelease: undefined, },],
      ["1.0.0-alpha", { major: "1", minor: "0", patch: "0", prerelease: "alpha", },],
      ["1.2.3-beta.1", { major: "1", minor: "2", patch: "3", prerelease: "beta.1", },],
    ],)("parses '%s'", (input, expected,) => {
      const match = SEMVER.exec(input,);
      expect(match,).not.toBeNull();
      expect(match?.[1],).toBe(expected.major,);
      expect(match?.[2],).toBe(expected.minor,);
      expect(match?.[3],).toBe(expected.patch,);
      expect(match?.[4],).toBe(expected.prerelease,);
    },);

    it("returns null for invalid versions", () => {
      expect(SEMVER.exec("abc",),).toBeNull();
      expect(SEMVER.exec("1.0",),).toBeNull();
    });
  });

  describe("RELEASE_BRANCH", () => {
    it("matches release branches", () => {
      const match = RELEASE_BRANCH.exec("release/123",);
      expect(match?.[1],).toBe("123",);
    });

    it("returns null for non-release branches", () => {
      expect(RELEASE_BRANCH.exec("feature/foo",),).toBeNull();
      expect(RELEASE_BRANCH.exec("main",),).toBeNull();
    });
  });
});
