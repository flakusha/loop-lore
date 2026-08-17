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
