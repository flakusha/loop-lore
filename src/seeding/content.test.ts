// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/* eslint-disable sonarjs/no-hardcoded-passwords -- passwords are test fixtures */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuthConfig, SeedingConfig, } from "../config/schema";
import { UserRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { applyEnvironmentOverrides, seedConfiguredContent, } from "./content";
import { seedConfiguredUsers, } from "./users";

/** Complete, valid AuthConfig for multi-user tests. */
function auth(required: boolean,): AuthConfig {
  return {
    required,
    registrationOpen: true,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 10,
    demoUsername: "demo",
    demoAutoSetup: false,
  };
}

/** A seeding config targeting player1/player2 as content owners. */
function makeSeeding(): SeedingConfig {
  return {
    enabled: true,
    users: [
      { username: "player1", password: "pw1", role: UserRole.Player, },
      { username: "player2", password: "pw2", role: UserRole.Player, },
    ],
    seedData: {
      characters: [
        { name: "Orin", owner: "player1", description: "A ranger", personality: ["stoic", "wary",], },
        { name: "Mira", owner: "player2", visibility: "public", },
      ],
      worlds: [
        {
          name: "Verdant Vale",
          creator: "player1",
          description: "A lush valley",
          locations: [{ name: "River Bend", }, { name: "Old Keep", description: "Ruined tower", },],
        },
      ],
      chats: [
        { participants: ["player1", "player2",], type: "direct", },
        { name: "Party", participants: ["player1", "player2",], type: "group", },
      ],
    },
  };
}

describe("applyEnvironmentOverrides", () => {
  test("returns the same config when no environment matches", () => {
    const seeding = makeSeeding();
    expect(applyEnvironmentOverrides(seeding, "production",),).toBe(seeding,);
  });

  test("replaces users and seedData when a matching environment is present", () => {
    const base = makeSeeding();
    const overridden = applyEnvironmentOverrides(
      {
        ...base,
        environments: {
          staging: {
            users: [{ username: "staging_admin", password: "spw", role: UserRole.Admin, },],
            seedData: { chats: [{ participants: ["staging_admin",], },], },
          },
        },
      },
      "staging",
    );
    expect(overridden.users.map((u,) => u.username),).toEqual(["staging_admin",],);
    expect(overridden.seedData?.chats,).toHaveLength(1,);
    expect(overridden.seedData?.characters,).toBeUndefined();
  });

  test("partial override (only users) keeps the base seedData", () => {
    const base = makeSeeding();
    const overridden = applyEnvironmentOverrides(
      {
        ...base,
        environments: {
          development: { users: [{ username: "dev_admin", password: "dev", role: UserRole.Admin, },], },
        },
      },
      "development",
    );
    expect(overridden.users.map((u,) => u.username),).toEqual(["dev_admin",],);
    expect(overridden.seedData,).toEqual(base.seedData,);
  });
});

describe("seedConfiguredContent", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
    // Prepopulate owners via user seeding so content owners resolve.
    await seedConfiguredUsers(db, { seeding: makeSeeding(), auth: auth(true,), },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("creates characters, worlds (+locations) and chats with participants and audit rows", async () => {
    const created = await seedConfiguredContent(db, makeSeeding(), true,);

    // 2 characters + 1 world + 2 chats = 5 content entities
    expect(created,).toBe(5,);

    const chars = await db
      .selectFrom("actors",)
      .select(["display_name", "actor_type", "personality", "visibility",],)
      .where("actor_type", "=", "character",)
      .where("display_name", "in", ["Orin", "Mira",],)
      .execute();
    expect(chars,).toHaveLength(2,);
    const orin = chars.find((c,) => c.display_name === "Orin");
    expect(orin?.personality,).toBe(JSON.stringify(["stoic", "wary",],),);
    const mira = chars.find((c,) => c.display_name === "Mira");
    expect(mira?.visibility,).toBe("public",);

    const world = await db
      .selectFrom("worlds",)
      .select(["name", "publication_status",],)
      .where("name", "=", "Verdant Vale",)
      .executeTakeFirst();
    expect(world?.publication_status,).toBe("draft",);

    const locations = await db
      .selectFrom("locations",)
      .select("name",)
      .where("name", "in", ["River Bend", "Old Keep",],)
      .execute();
    expect(locations,).toHaveLength(2,);

    const groupChat = await db
      .selectFrom("chats",)
      .select(["name", "type", "mode",],)
      .where("name", "in", ["player1, player2", "Party",],)
      .execute();
    expect(groupChat.map((c,) => c.name).sort(),).toEqual(["Party", "player1, player2",],);
    const party = groupChat.find((c,) => c.name === "Party");
    expect(party?.type,).toBe("group",);
    expect(party?.mode,).toBe("group",);

    const participantCount = await db
      .selectFrom("chat_participants",)
      .select(db.fn.countAll<number>().as("n",),)
      .executeTakeFirst();
    expect(participantCount?.n,).toBe(4,);

    const audit = await db
      .selectFrom("seed_audit",)
      .select("seed_type",)
      .where("seed_type", "in", ["character", "world", "chat",],)
      .execute();
    expect(audit,).toHaveLength(5,);
  });

  test("is idempotent — re-running creates nothing new", async () => {
    const created = await seedConfiguredContent(db, makeSeeding(), true,);
    expect(created,).toBe(0,);

    const charCount = await db
      .selectFrom("actors",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("actor_type", "=", "character",)
      .executeTakeFirst();
    expect(charCount?.n,).toBe(2,);
  });

  test("skips content referencing unknown owners", async () => {
    const seeding: SeedingConfig = {
      enabled: true,
      users: [],
      seedData: {
        characters: [{ name: "Ghost", owner: "nobody", },],
        worlds: [{ name: "Lost Realm", creator: "nobody", },],
      },
    };
    // 0 resolvable — owners don't exist
    const created = await seedConfiguredContent(db, seeding, true,);
    expect(created,).toBe(0,);
  });

  test("skips entirely when seeding disabled", async () => {
    const seeding: SeedingConfig = { ...makeSeeding(), enabled: false, };
    expect(await seedConfiguredContent(db, seeding, true,),).toBe(0,);
  });

  test("skips entirely in solo mode (auth not required)", async () => {
    const created = await seedConfiguredContent(db, makeSeeding(), false,);
    expect(created,).toBe(0,);
  });
});
