/**
 * Event Extraction — Item Transfer emission tests.
 *
 * Verifies `extractEvents` produces correct `fromActorId`/`toActorId`
 * direction for each item verb class and carries `locationId` so the
 * event application layer can resolve a source instance:
 *   - give/hand/offer/pass/trade → actor RECEIVES (fromActorId null)
 *   - take/pick up/grab/collect → actor RECEIVES (fromActorId null)
 *   - drop/leave/abandon/put down → actor is the SOURCE (fromActorId set)
 */
import { describe, expect, test, } from "bun:test";
import { WorldEventType, } from "../../db/enums-story";
import { extractEvents, } from "./extraction";

const LOC = "loc-1";
const ACTOR = "actor-1";

describe("extractEvents — item transfer direction", () => {
  test("give → actor is the source (gives away)", () => {
    const events = extractEvents({
      messageContent: "Sam gives the Iron Sword to Kara.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBe(ACTOR,);
    expect(item!.data.toActorId,).toBeNull();
    expect(item!.locationId,).toBe(LOC,);
  });

  test("take → actor is the receiver", () => {
    const events = extractEvents({
      messageContent: "Sam picks up the Rusty Dagger.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBeNull();
    expect(item!.data.toActorId,).toBe(ACTOR,);
  });

  test("drop → actor is the source", () => {
    const events = extractEvents({
      messageContent: "Sam drops the Torch and walks on.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBe(ACTOR,);
    expect(item!.data.toActorId,).toBeNull();
    expect(item!.locationId,).toBe(LOC,);
  });

  test("leave behind → actor is the source", () => {
    const events = extractEvents({
      messageContent: "Sam leaves behind the Shield.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.fromActorId,).toBe(ACTOR,);
    expect(item!.data.toActorId,).toBeNull();
  });
});

// ── Location Change ─────────────────────────────────────────

describe("extractEvents — location change detection", () => {
  test("enters → LocationChange with captured name, fromLocationId, reason", () => {
    const events = extractEvents({
      messageContent: "Sam enters the Dark Forest.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
    expect(loc,).toBeDefined();
    expect(loc!.data.toLocationName,).toBe("the Dark Forest",);
    expect(loc!.data.fromLocationId,).toBe(LOC,);
    expect(loc!.data.reason,).toBe("narrative",);
    expect(loc!.locationId,).toBe(LOC,);
    expect(loc!.description,).toBe(`${ACTOR} moved to the Dark Forest`,);
  });

  test("quoted location → quotes stripped from captured name", () => {
    const events = extractEvents({
      messageContent: 'Sam enters "The Dark Forest".',
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
    expect(loc,).toBeDefined();
    expect(loc!.data.toLocationName,).toBe("The Dark Forest",);
  });

  test("leaves the → article consumed by pattern, bare name captured", () => {
    const events = extractEvents({
      messageContent: "Sam leaves the Tavern.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
    expect(loc,).toBeDefined();
    expect(loc!.data.toLocationName,).toBe("Tavern",);
  });

  test("moves to / heads to / arrives at variants all match", () => {
    for (
      const msg of [
        "Sam moves to the Tavern.",
        "Sam heads to the Tavern.",
        "Sam arrives at the Tavern.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
      expect(loc,).toBeDefined();
      expect(loc!.data.toLocationName,).toBe("the Tavern",);
    }
  });

  test("travel variants: ventures into / makes their way to", () => {
    const cases: [string, string,][] = [
      ["Sam ventures into the Dark Forest.", "the Dark Forest",],
      ["Sam makes their way to the Tavern.", "the Tavern",],
    ];

    for (const [msg, name,] of cases) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
      expect(loc,).toBeDefined();
      expect(loc!.data.toLocationName,).toBe(name,);
    }
  });

  test("case-insensitive match preserves original case in capture", () => {
    const events = extractEvents({
      messageContent: "SAM ENTERS THE TAVERN.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
    expect(loc,).toBeDefined();
    expect(loc!.data.toLocationName,).toBe("THE TAVERN",);
  });

  test("unicode location name → no event (patterns are ASCII-only)", () => {
    const events = extractEvents({
      messageContent: "Sam enters die Höhle.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.LocationChange),).toBeUndefined();
  });

  test("null currentLocationId → locationId and fromLocationId undefined", () => {
    const events = extractEvents({
      messageContent: "Sam enters the Dark Forest.",
      actorId: ACTOR,
      currentLocationId: null,
    },);

    const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
    expect(loc,).toBeDefined();
    expect(loc!.locationId,).toBeUndefined();
    expect(loc!.data.fromLocationId,).toBeUndefined();
  });

  test("no location keyword → no LocationChange", () => {
    const events = extractEvents({
      messageContent: "Sam sits quietly by the fire.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.LocationChange),).toBeUndefined();
  });
});

// ── Time Advancement ────────────────────────────────────────

describe("extractEvents — time advancement detection", () => {
  test("hours pass → TimeAdvancement with fixed 120-minute skip", () => {
    const events = extractEvents({
      messageContent: "Hours pass.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const time = events.find((e,) => e.type === WorldEventType.TimeAdvancement);
    expect(time,).toBeDefined();
    expect(time!.data.minutesAdvanced,).toBe(120,);
    expect(time!.data.newTimeOfDay,).toBe("unknown",);
    expect(time!.data.reason,).toBe("narrative time skip",);
  });

  test("time phrases: later that night / the sun sets / dawn breaks", () => {
    for (
      const msg of [
        "Later that night, they rest.",
        "The sun sets.",
        "Dawn breaks.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      expect(events.find((e,) => e.type === WorldEventType.TimeAdvancement),).toBeDefined();
    }
  });

  test("time phrases: the next day / a week later / after a few hours", () => {
    for (
      const msg of [
        "The next day.",
        "A week later.",
        "After a few hours.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      expect(events.find((e,) => e.type === WorldEventType.TimeAdvancement),).toBeDefined();
    }
  });

  test("no time keyword → no TimeAdvancement", () => {
    const events = extractEvents({
      messageContent: "Sam sharpens his sword.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.TimeAdvancement),).toBeUndefined();
  });
});

// ── Combat ──────────────────────────────────────────────────

describe("extractEvents — combat detection", () => {
  test("strike → CombatEvent, physical damage, not defeated", () => {
    const events = extractEvents({
      messageContent: "Sam strikes the goblin.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const combat = events.find((e,) => e.type === WorldEventType.CombatEvent);
    expect(combat,).toBeDefined();
    expect(combat!.data.attackerId,).toBe(ACTOR,);
    expect(combat!.data.defenderId,).toBe("unknown",);
    expect(combat!.data.damage,).toBe(0,);
    expect(combat!.data.damageType,).toBe("physical",);
    expect(combat!.data.statusEffects,).toEqual([],);
    expect(combat!.data.defeated,).toBe(false,);
  });

  test("defeated keyword anywhere in content → defeated true", () => {
    const events = extractEvents({
      messageContent: "Sam strikes the goblin. It is slain.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const combat = events.find((e,) => e.type === WorldEventType.CombatEvent);
    expect(combat,).toBeDefined();
    expect(combat!.data.defeated,).toBe(true,);
  });

  test("'defeats' does not satisfy the 'defeated' check → stays false", () => {
    const events = extractEvents({
      messageContent: "Sam strikes the goblin and defeats it.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const combat = events.find((e,) => e.type === WorldEventType.CombatEvent);
    expect(combat,).toBeDefined();
    expect(combat!.data.defeated,).toBe(false,);
  });

  test("damage phrases: takes N damage / loses N hp / health drops to N", () => {
    for (
      const msg of [
        "Sam takes 5 damage.",
        "Sam loses 10 hp.",
        "Health drops to 5.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      expect(events.find((e,) => e.type === WorldEventType.CombatEvent),).toBeDefined();
    }
  });

  test("fires at → matches", () => {
    const events = extractEvents({
      messageContent: "Sam fires at the goblin.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.CombatEvent),).toBeDefined();
  });

  test("'Health drops to 5.' also trips the drop item pattern (nested marker collision)", () => {
    const events = extractEvents({
      messageContent: "Health drops to 5.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.CombatEvent),).toBeDefined();
    const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
    expect(item,).toBeDefined();
    expect(item!.data.itemName,).toBe("t",);
    expect(item!.data.fromActorId,).toBe(ACTOR,);
  });

  test("no combat keyword → no CombatEvent", () => {
    const events = extractEvents({
      messageContent: "Sam watches the rain.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.CombatEvent),).toBeUndefined();
  });
});

// ── NPC State Change ────────────────────────────────────────

describe("extractEvents — NPC state change detection", () => {
  test("looks suspicious → NpcStateChange with mental_state changed", () => {
    const events = extractEvents({
      messageContent: "The guard looks suspicious.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const npc = events.find((e,) => e.type === WorldEventType.NpcStateChange);
    expect(npc,).toBeDefined();
    expect(npc!.data.npcActorId,).toBe(ACTOR,);
    expect(npc!.data.changes,).toEqual({ mental_state: "changed", },);
  });

  test("becomes more friendly → matches", () => {
    const events = extractEvents({
      messageContent: "The guard becomes more friendly.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.NpcStateChange),).toBeDefined();
  });

  test("confesses that he has → matches", () => {
    const events = extractEvents({
      messageContent: "He confesses that he has the map.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.NpcStateChange),).toBeDefined();
  });

  test("reveals that she found → fires both NPC state change and lore update", () => {
    const events = extractEvents({
      messageContent: "She reveals that she found the door.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.NpcStateChange),).toBeDefined();
    expect(events.find((e,) => e.type === WorldEventType.WorldLoreUpdate),).toBeDefined();
  });

  test("'tells that' never matches (pattern requires double space) → no event", () => {
    const events = extractEvents({
      messageContent: "She tells that she knows the secret.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.NpcStateChange),).toBeUndefined();
  });

  test("unlisted emotion 'looks tired' → no event", () => {
    const events = extractEvents({
      messageContent: "The guard looks tired.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.NpcStateChange),).toBeUndefined();
  });
});

// ── Lore Update ─────────────────────────────────────────────

describe("extractEvents — lore update detection", () => {
  test("reveals that → WorldLoreUpdate with the revealing sentence", () => {
    const events = extractEvents({
      messageContent: "She reveals that the sword is cursed.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const lore = events.find((e,) => e.type === WorldEventType.WorldLoreUpdate);
    expect(lore,).toBeDefined();
    expect(lore!.data.newLoreEntry,).toBe("She reveals that the sword is cursed",);
    expect(lore!.data.category,).toBe("narrative_revelation",);
    expect(lore!.data.confidence,).toBe(0.5,);
  });

  test("according to ancient texts → matches", () => {
    const events = extractEvents({
      messageContent: "According to ancient texts, the mountain sleeps.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const lore = events.find((e,) => e.type === WorldEventType.WorldLoreUpdate);
    expect(lore,).toBeDefined();
    expect(lore!.data.newLoreEntry,).toBe("According to ancient texts, the mountain sleeps",);
  });

  test("'according to legend,' never matches (comma breaks the pattern) → no event", () => {
    const events = extractEvents({
      messageContent: "According to legend, the sword sleeps.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.WorldLoreUpdate),).toBeUndefined();
  });

  test("uncovers / realizes that / learned that / discovered that variants", () => {
    for (
      const msg of [
        "He uncovers the truth.",
        "She realizes that the door is open.",
        "He learned that the map was fake.",
        "She discovered that the chest was trapped.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      expect(events.find((e,) => e.type === WorldEventType.WorldLoreUpdate),).toBeDefined();
    }
  });

  test("multi-sentence message → only the revealing sentence captured", () => {
    const events = extractEvents({
      messageContent: "The fire crackles. She reveals that the sword is cursed. He nods.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const lore = events.find((e,) => e.type === WorldEventType.WorldLoreUpdate);
    expect(lore,).toBeDefined();
    expect(lore!.data.newLoreEntry,).toBe("She reveals that the sword is cursed",);
  });

  test("no terminal period → sentence still captured", () => {
    const events = extractEvents({
      messageContent: "She reveals that the sword is cursed",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const lore = events.find((e,) => e.type === WorldEventType.WorldLoreUpdate);
    expect(lore,).toBeDefined();
    expect(lore!.data.newLoreEntry,).toBe("She reveals that the sword is cursed",);
  });

  test("no lore pattern → no WorldLoreUpdate", () => {
    const events = extractEvents({
      messageContent: "Sam polishes his boots.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.WorldLoreUpdate),).toBeUndefined();
  });
});

// ── Item Transfer Edge Cases ────────────────────────────────

describe("extractEvents — item transfer edge cases", () => {
  test("give-class verbs capture the full item name", () => {
    const cases: [string, string,][] = [
      ["Sam hands the Map to Kara.", "Map",],
      ["Sam offers the Coin to the guard.", "Coin",],
      ["Sam passes the Note to Kara.", "Note",],
      ["Sam trades the Sword for the Shield.", "Sword",],
    ];

    for (const [msg, name,] of cases) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
      expect(item,).toBeDefined();
      expect(item!.data.fromActorId,).toBe(ACTOR,);
      expect(item!.data.toActorId,).toBeNull();
      expect(item!.data.itemName,).toBe(name,);
      expect(item!.data.quantity,).toBe(1,);
    }
  });

  test("take-class verbs → actor receives", () => {
    for (
      const msg of [
        "Sam takes a Potion.",
        "Sam receives the Letter.",
        "Sam finds the Key.",
        "Sam grabs the Gem.",
        "Sam collects the Herbs.",
        "Sam acquires the Tome.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
      expect(item,).toBeDefined();
      expect(item!.data.fromActorId,).toBeNull();
      expect(item!.data.toActorId,).toBe(ACTOR,);
      expect(item!.data.quantity,).toBe(1,);
    }
  });

  test("drop-class verbs → actor is the source", () => {
    for (
      const msg of [
        "Sam abandons the Torch.",
        "Sam puts down the Bowl.",
      ]
    ) {
      const events = extractEvents({ messageContent: msg, actorId: ACTOR, currentLocationId: LOC, },);
      const item = events.find((e,) => e.type === WorldEventType.ItemTransfer);
      expect(item,).toBeDefined();
      expect(item!.data.fromActorId,).toBe(ACTOR,);
      expect(item!.data.toActorId,).toBeNull();
    }
  });

  test("multiple transfers in one message → one event per matching pattern", () => {
    const events = extractEvents({
      messageContent: "Sam gives the Sword to Kara and drops the Shield.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const items = events.filter((e,) => e.type === WorldEventType.ItemTransfer);
    expect(items,).toHaveLength(2,);
    expect(items[0]!.data.itemName,).toBe("Sword",);
    expect(items[0]!.data.fromActorId,).toBe(ACTOR,);
    expect(items[1]!.data.fromActorId,).toBe(ACTOR,);
    expect(items[1]!.data.toActorId,).toBeNull();
  });

  test("unicode item name → no event (patterns are ASCII-only)", () => {
    const events = extractEvents({
      messageContent: "Sam gives the Übung to Kara.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.find((e,) => e.type === WorldEventType.ItemTransfer),).toBeUndefined();
  });
});

// ── Malformed & Edge Inputs ─────────────────────────────────

describe("extractEvents — malformed and edge inputs", () => {
  test("empty message → no events", () => {
    const events = extractEvents({ messageContent: "", actorId: ACTOR, currentLocationId: LOC, },);
    expect(events,).toEqual([],);
  });

  test("whitespace-only message → no events", () => {
    const events = extractEvents({ messageContent: "   \n\t  ", actorId: ACTOR, currentLocationId: LOC, },);
    expect(events,).toEqual([],);
  });

  test("message matching no pattern → no events", () => {
    const events = extractEvents({ messageContent: "Nothing happens here.", actorId: ACTOR, currentLocationId: LOC, },);
    expect(events,).toEqual([],);
  });

  test("oversized message with pattern at the end → still extracts", () => {
    const events = extractEvents({
      messageContent: "word ".repeat(5000,) + "Sam enters the Tavern.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    const loc = events.find((e,) => e.type === WorldEventType.LocationChange);
    expect(loc,).toBeDefined();
    expect(loc!.data.toLocationName,).toBe("the Tavern",);
  });

  test("oversized message without pattern → no events", () => {
    const events = extractEvents({
      messageContent: "word ".repeat(5000,),
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events,).toEqual([],);
  });

  test("combined message → location and item events both emitted in detector order", () => {
    const events = extractEvents({
      messageContent: "Sam gives the Sword to Kara and enters the Tavern.",
      actorId: ACTOR,
      currentLocationId: LOC,
    },);

    expect(events.map((e,) => e.type),).toEqual([
      WorldEventType.LocationChange,
      WorldEventType.ItemTransfer,
    ],);
  });
});
