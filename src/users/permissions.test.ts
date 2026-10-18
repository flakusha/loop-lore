// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { UserRole, } from "../db/enums";
import { can, DEFAULT_PERMISSIONS, hasAll, } from "./permissions";
import { ALL_ROLES, isAdminRole, isElevatedRole, isValidRole, } from "./roles";

describe("permissions — can()", () => {
  it("admin is granted any permission", () => {
    expect(can(UserRole.Admin, "character.delete_any",),).toBe(true,);
    expect(can(UserRole.Admin, "admin.system",),).toBe(true,);
  });

  it("tester is granted full access", () => {
    expect(can(UserRole.Tester, "admin.system",),).toBe(true,);
  });

  it("solo is granted full access", () => {
    expect(can(UserRole.Solo, "user.ban",),).toBe(true,);
  });

  it("moderator gets namespace wildcard and user-moderation powers", () => {
    expect(can(UserRole.Moderator, "moderation.review",),).toBe(true,);
    expect(can(UserRole.Moderator, "moderation.action",),).toBe(true,);
    expect(can(UserRole.Moderator, "user.ban",),).toBe(true,);
  });

  it("moderator does NOT get full admin", () => {
    expect(can(UserRole.Moderator, "admin.settings",),).toBe(false,);
    expect(can(UserRole.Moderator, "admin.system",),).toBe(false,);
  });

  it("creator gets character/world namespaces + import/export", () => {
    expect(can(UserRole.Creator, "character.edit_any",),).toBe(true,);
    expect(can(UserRole.Creator, "world.delete_any",),).toBe(true,);
    expect(can(UserRole.Creator, "import.own",),).toBe(true,);
  });

  it("player gets self-scoped character/world + chat basics", () => {
    expect(can(UserRole.Player, "character.create",),).toBe(true,);
    expect(can(UserRole.Player, "character.edit_own",),).toBe(true,);
    expect(can(UserRole.Player, "world.create",),).toBe(true,);
    expect(can(UserRole.Player, "chat.join",),).toBe(true,);
  });

  it("player cannot edit others' characters or delete chats", () => {
    expect(can(UserRole.Player, "character.edit_any",),).toBe(false,);
    expect(can(UserRole.Player, "chat.delete",),).toBe(false,);
  });

  it("viewer is read-only", () => {
    expect(can(UserRole.Viewer, "character.view",),).toBe(true,);
    expect(can(UserRole.Viewer, "chat.join",),).toBe(true,);
    expect(can(UserRole.Viewer, "character.create",),).toBe(false,);
  });

  it("guest has minimal join/view", () => {
    expect(can(UserRole.Guest, "chat.join",),).toBe(true,);
    expect(can(UserRole.Guest, "character.view",),).toBe(true,);
    expect(can(UserRole.Guest, "world.create",),).toBe(false,);
  });

  it("bot can join and create chats but nothing else", () => {
    expect(can(UserRole.Bot, "chat.join",),).toBe(true,);
    expect(can(UserRole.Bot, "chat.create",),).toBe(true,);
    expect(can(UserRole.Bot, "character.view",),).toBe(false,);
  });

  it("custom role has no default permissions", () => {
    expect(can(UserRole.Custom, "chat.join",),).toBe(false,);
    expect(can(UserRole.Custom, "character.view",),).toBe(false,);
  });

  it("null / unknown role is denied", () => {
    expect(can(null, "chat.join",),).toBe(false,);
    expect(can("not-a-role", "chat.join",),).toBe(false,);
    expect(can(undefined, "chat.join",),).toBe(false,);
  });

  it("exact permission matches without wildcard", () => {
    expect(can(UserRole.Player, "export.own",),).toBe(true,);
  });

  it("wildcard namespace matches any permission in the namespace", () => {
    expect(can(UserRole.Moderator, "chat.create",),).toBe(true,);
    expect(can(UserRole.Moderator, "chat.join",),).toBe(true,);
  });
});

describe("permissions — hasAll()", () => {
  it("returns true when all permissions granted", () => {
    expect(
      hasAll(UserRole.Creator, ["character.create", "world.create", "import.own",],),
    ).toBe(true,);
  });

  it("returns false when any permission is missing", () => {
    expect(hasAll(UserRole.Viewer, ["character.view", "character.create",],),).toBe(false,);
  });
});

describe("permissions — DEFAULT_PERMISSIONS coverage", () => {
  it("defines an entry for every role", () => {
    for (const role of ALL_ROLES) {
      expect(DEFAULT_PERMISSIONS[role],).toBeDefined();
    }
  });
});

describe("roles — helpers", () => {
  it("isValidRole accepts known roles and rejects unknowns", () => {
    expect(isValidRole("admin",),).toBe(true,);
    expect(isValidRole("moderator",),).toBe(true,);
    expect(isValidRole("creator",),).toBe(true,);
    expect(isValidRole("player",),).toBe(true,);
    expect(isValidRole("viewer",),).toBe(true,);
    expect(isValidRole("guest",),).toBe(true,);
    expect(isValidRole("bot",),).toBe(true,);
    expect(isValidRole("tester",),).toBe(true,);
    expect(isValidRole("custom",),).toBe(true,);
    expect(isValidRole("solo",),).toBe(true,);
    expect(isValidRole("superadmin",),).toBe(false,);
    expect(isValidRole(null,),).toBe(false,);
    expect(isValidRole(undefined,),).toBe(false,);
  });

  it("isAdminRole is true only for admin and solo", () => {
    expect(isAdminRole("admin",),).toBe(true,);
    expect(isAdminRole("solo",),).toBe(true,);
    expect(isAdminRole("moderator",),).toBe(false,);
    expect(isAdminRole("user",),).toBe(false,);
    expect(isAdminRole(null,),).toBe(false,);
  });

  it("isElevatedRole includes moderator", () => {
    expect(isElevatedRole("admin",),).toBe(true,);
    expect(isElevatedRole("solo",),).toBe(true,);
    expect(isElevatedRole("moderator",),).toBe(true,);
    expect(isElevatedRole("player",),).toBe(false,);
    expect(isElevatedRole("user",),).toBe(false,);
  });

  it("ALL_ROLES contains every expanded role", () => {
    expect(ALL_ROLES,).toContain(UserRole.Moderator,);
    expect(ALL_ROLES,).toContain(UserRole.Creator,);
    expect(ALL_ROLES,).toContain(UserRole.Player,);
    expect(ALL_ROLES,).toContain(UserRole.Guest,);
    expect(ALL_ROLES,).toContain(UserRole.Bot,);
    expect(ALL_ROLES,).toContain(UserRole.Tester,);
    expect(ALL_ROLES,).toContain(UserRole.Custom,);
  });
});

// ── The full matrix contract ────────────────────────────────────────────────
//
// The spot-checks above assert a handful of representative facts per role. This
// section is exhaustive instead: every role's ENTIRE effective grant set is
// pinned, in both directions (every listed permission granted, every other
// vocabulary entry denied). A role silently widened with one extra permission —
// or narrowed by one — fails here, where the spot-checks would not notice.
//
// Assertions go through `can()` — the same helper the route guards call — so
// wildcard resolution is exercised on the real code path rather than on a
// re-implementation of it.

/**
 * Every permission the `Permission` union admits. Denials are asserted against
 * this list, so a permission added to the union but forgotten in a role's row
 * fails the "denied" leg instead of silently going unchecked.
 */
const VOCABULARY = [
  "chat.create",
  "chat.join",
  "chat.delete",
  "character.create",
  "character.view",
  "character.edit_own",
  "character.edit_any",
  "character.delete_own",
  "character.delete_any",
  "world.create",
  "world.view",
  "world.edit_own",
  "world.edit_any",
  "world.delete_own",
  "world.delete_any",
  "user.view",
  "user.edit",
  "user.delete",
  "user.ban",
  "moderation.review",
  "moderation.action",
  "admin.settings",
  "admin.users",
  "admin.system",
  "admin.character",
  "admin.chat",
  "admin.world",
  "admin.audit.nsfw",
  "export.own",
  "export.any",
  "import.own",
  "import.any",
] as const;

/** A role's expected effective grant set, after wildcards resolve. */
interface RoleContract {
  /** The role key in DEFAULT_PERMISSIONS. */
  role: UserRole;
  /** Permissions `can(role, p)` must answer true for. */
  granted: readonly string[];
  /** Wildcard token the raw matrix must hold for this role, if any. */
  wildcard?: string;
}

/** Every role the matrix defines, with its expected effective grants. */
const CONTRACTS: readonly RoleContract[] = [
  // The "*" roles resolve to the whole vocabulary; the wildcard rule itself is
  // asserted separately below rather than assumed here.
  { role: UserRole.Admin, wildcard: "*", granted: VOCABULARY, },
  { role: UserRole.Tester, wildcard: "*", granted: VOCABULARY, },
  { role: UserRole.Solo, wildcard: "*", granted: VOCABULARY, },
  {
    // Moderation is the classic privilege-escalation target: `chat.*` and
    // `moderation.*` are namespace wildcards, but the ownership bypasses
    // (admin.chat / admin.character / admin.world) and the platform perms
    // (admin.system / admin.users / admin.settings) must NOT ride along.
    role: UserRole.Moderator,
    granted: [
      "chat.create",
      "chat.join",
      "chat.delete",
      "character.view",
      "world.view",
      "user.view",
      "user.ban",
      "moderation.review",
      "moderation.action",
    ],
  },
  {
    role: UserRole.User,
    granted: [
      "chat.create",
      "chat.join",
      "character.create",
      "character.edit_own",
      "world.create",
      "world.edit_own",
      "export.own",
    ],
  },
  {
    role: UserRole.Player,
    granted: [
      "chat.create",
      "chat.join",
      "character.create",
      "character.edit_own",
      "world.create",
      "world.edit_own",
      "export.own",
    ],
  },
  {
    role: UserRole.Creator,
    granted: [
      "chat.create",
      "chat.join",
      "chat.delete",
      "character.create",
      "character.view",
      "character.edit_own",
      "character.edit_any",
      "character.delete_own",
      "character.delete_any",
      "world.create",
      "world.view",
      "world.edit_own",
      "world.edit_any",
      "world.delete_own",
      "world.delete_any",
      "export.own",
      "import.own",
    ],
  },
  { role: UserRole.Viewer, granted: ["chat.join", "character.view", "world.view",], },
  { role: UserRole.Guest, granted: ["chat.join", "character.view", "world.view",], },
  { role: UserRole.Bot, granted: ["chat.join", "chat.create",], },
  { role: UserRole.Custom, granted: [], },
];

describe("permissions — exhaustive role matrix", () => {
  it("the contracts enumerate every role the matrix defines", () => {
    // A role added to DEFAULT_PERMISSIONS without a contract row would be
    // silently unpinned, so this fails until it is given an expectation.
    expect(Object.keys(DEFAULT_PERMISSIONS,).sort(),).toEqual(
      [...CONTRACTS.map((c,) => c.role),].sort(),
    );
  });

  for (const contract of CONTRACTS) {
    it(`${contract.role} holds exactly its contracted permissions`, () => {
      const granted = new Set(contract.granted,);
      const unexpected: string[] = [];
      const missing: string[] = [];

      for (const permission of VOCABULARY) {
        const actual = can(contract.role, permission,);
        if (granted.has(permission,)) {
          if (!actual) { missing.push(permission,); }
        } else if (actual) {
          unexpected.push(permission,);
        }
      }

      expect({ role: contract.role, unexpected, missing, },).toEqual({
        role: contract.role,
        unexpected: [],
        missing: [],
      },);
    });

    it(`${contract.role} raw matrix holds its declared wildcard token`, () => {
      if (contract.wildcard === undefined) {
        expect(DEFAULT_PERMISSIONS[contract.role].includes("*",),).toBe(false,);
        return;
      }

      expect(DEFAULT_PERMISSIONS[contract.role],).toContain(contract.wildcard,);
    });
  }

  it('a role holding "*" is granted the whole vocabulary', () => {
    const wildcardRoles = Object.entries(DEFAULT_PERMISSIONS,)
      .filter(([, perms,],) => perms.includes("*",))
      .map(([role,],) => role)
      .sort();

    // Pin the premise first: an empty set would make the loop vacuously pass.
    expect(wildcardRoles,).toEqual([UserRole.Admin, UserRole.Solo, UserRole.Tester,],);

    for (const role of wildcardRoles) {
      for (const permission of VOCABULARY) {
        expect({ role, permission, allowed: can(role, permission,), },).toEqual({
          role,
          permission,
          allowed: true,
        },);
      }
    }
  });

  it('only the "*" roles hold the chat/character/world ownership bypasses', () => {
    // admin.chat / admin.character / admin.world are the guards that let a role
    // operate on ANY user's content — the owner check passes first, then the
    // bypass overrides it. Reachable only by a wildcard role.
    const bypasses = ["admin.chat", "admin.character", "admin.world",];
    const holders = Object.keys(DEFAULT_PERMISSIONS,)
      .filter((role,) => bypasses.every((p,) => can(role, p,)))
      .sort();

    expect(holders,).toEqual([UserRole.Admin, UserRole.Solo, UserRole.Tester,],);
  });

  it("moderator holds neither an ownership bypass nor platform administration", () => {
    // Named explicitly because moderation is a half-elevated role: a stray
    // "admin.*" entry here would hand a moderator every user's content plus
    // the platform config — exactly the escalation the split exists to stop.
    const forbidden = [
      "admin.system",
      "admin.chat",
      "admin.character",
      "admin.world",
      "admin.users",
      "admin.settings",
      "user.edit",
      "user.delete",
      "character.edit_any",
      "character.delete_any",
      "world.edit_any",
      "world.delete_any",
    ];

    for (const permission of forbidden) {
      expect(can(UserRole.Moderator, permission,),).toBe(false,);
    }
  });

  it("_own permissions never imply their _any counterpart outside a bypass role", () => {
    expect(can(UserRole.User, "character.edit_own",),).toBe(true,);
    expect(can(UserRole.User, "character.edit_any",),).toBe(false,);
    expect(can(UserRole.User, "world.delete_own",),).toBe(false,);
    // `player` mirrors `user` and holds no delete permission at all — neither
    // the self-scoped `_own` nor the `_any` bypass.
    expect(can(UserRole.Player, "character.delete_own",),).toBe(false,);
    expect(can(UserRole.Player, "character.delete_any",),).toBe(false,);
    // `creator` is the one non-wildcard role that does hold the `_any` bypass.
    expect(can(UserRole.Creator, "character.delete_own",),).toBe(true,);
    expect(can(UserRole.Viewer, "character.edit_own",),).toBe(false,);
    expect(can(UserRole.Guest, "character.create",),).toBe(false,);
  });
});

describe("permissions — can() edge cases the matrix depends on", () => {
  it("an empty or unknown role holds nothing", () => {
    for (const role of ["", "wizard", "ADMIN", "admin ",]) {
      for (const permission of VOCABULARY) {
        expect(can(role, permission,),).toBe(false,);
      }
    }
  });

  it("hasAll requires every listed permission and vacuously accepts the empty list", () => {
    expect(hasAll(UserRole.User, ["chat.create", "chat.join",],),).toBe(true,);
    expect(hasAll(UserRole.User, ["chat.create", "chat.delete",],),).toBe(false,);
    expect(hasAll(UserRole.Guest, [],),).toBe(true,);
    expect(hasAll(null, ["chat.join",],),).toBe(false,);
  });

  it("an override replaces a role's set wholesale rather than merging", () => {
    const overrides = { user: ["chat.delete",], };

    expect(can("user", "chat.delete", overrides,),).toBe(true,);
    expect(can("user", "chat.create", overrides,),).toBe(false,);
    // Roles absent from the override fall through to the default matrix.
    expect(can(UserRole.Guest, "chat.join", overrides,),).toBe(true,);
  });

  it("a namespace wildcard is prefix-exact and does not leak to similar prefixes", () => {
    const overrides = { probe: ["chat.*",], };

    expect(can("probe", "chat.create", overrides,),).toBe(true,);
    expect(can("probe", "character.create", overrides,),).toBe(false,);
    expect(can("probe", "chatty.something", overrides,),).toBe(false,);
  });
});
