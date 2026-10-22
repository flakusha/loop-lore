// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, expectTypeOf, test, } from "bun:test";
import type {
  NpcPresent,
  PartyStatus,
  TransportProgress,
  TransportStatus,
  TravelStatusPayload,
  WorldChatLite,
  WorldConditionsSnapshot,
  WorldEdgeLink,
  WorldEditState,
  WorldInviteRow,
  WorldLocationDetail,
  WorldLocationLite,
  WorldLoreEntry,
  WorldPageState,
  WorldSummary,
} from "./world-types";
import * as worldTypes from "./world-types";

// world-types.ts is a pure type module — it ships no runtime values. These
// tests pin the shapes the world page and the Alpine stores consume, so a
// drift in a field name or nullability breaks the build (tsgo type-checks
// src/frontend/**) instead of silently changing the wire contract.
describe("world-types runtime surface", () => {
  test("exports no runtime values", () => {
    expect(Object.keys(worldTypes,),).toEqual([],);
  });
});

describe("world-types row shapes", () => {
  test("WorldInviteRow mirrors the backend invite row", () => {
    expectTypeOf<WorldInviteRow["id"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldInviteRow["worldId"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldInviteRow["code"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldInviteRow["createdAt"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldInviteRow["expiresAt"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldInviteRow["maxUses"]>().toEqualTypeOf<number | null>();
    expectTypeOf<WorldInviteRow["uses"]>().toEqualTypeOf<number>();
    expectTypeOf<WorldInviteRow["status"]>().toEqualTypeOf<string>();
  });

  test("WorldSummary keeps its nullable description", () => {
    expectTypeOf<WorldSummary["id"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldSummary["name"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldSummary["description"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldSummary["kind"]>().toEqualTypeOf<string>();
  });

  test("WorldConditionsSnapshot is all-nullable", () => {
    expectTypeOf<WorldConditionsSnapshot["timeOfDay"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldConditionsSnapshot["weather"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldConditionsSnapshot["sampledLocationId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldConditionsSnapshot["sampledLocationName"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldConditionsSnapshot["sampledAt"]>().toEqualTypeOf<string | null>();
  });

  test("WorldLocationLite / WorldLocationDetail keep the snake_case wire keys", () => {
    expectTypeOf<WorldLocationLite["parent_location_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldLocationLite["connections"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldLocationLite["coord_x"]>().toEqualTypeOf<number | null>();
    expectTypeOf<WorldLocationDetail["parent"]>().toEqualTypeOf<{ id: string; name: string } | null>();
    expectTypeOf<WorldLocationDetail["connections"]>().toEqualTypeOf<{ id: string; name: string }[]>();
    expectTypeOf<WorldLocationDetail["state"]>().toEqualTypeOf<
      {
        description_override: string | null;
        atmosphere: string | null;
        npcs_present: string;
        items_available: string;
        time_of_day: string | null;
        weather: string | null;
        hazards: string;
      } | null
    >();
  });

  test("WorldChatLite and NpcPresent use the documented casing", () => {
    expectTypeOf<WorldChatLite["current_location_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldChatLite["location_name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<NpcPresent["actorId"]>().toEqualTypeOf<string>();
    expectTypeOf<NpcPresent["displayName"]>().toEqualTypeOf<string>();
  });

  test("WorldEdgeLink carries the 047 adjacency fields", () => {
    expectTypeOf<WorldEdgeLink["from_id"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldEdgeLink["to_id"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldEdgeLink["mode"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldEdgeLink["game_hours"]>().toEqualTypeOf<number>();
    expectTypeOf<WorldEdgeLink["requires_discovery"]>().toEqualTypeOf<boolean>();
  });

  test("WorldLoreEntry keys stay a raw JSON string", () => {
    expectTypeOf<WorldLoreEntry["id"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldLoreEntry["name"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldLoreEntry["content"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldLoreEntry["keys"]>().toEqualTypeOf<string | null>();
    expectTypeOf<WorldLoreEntry["enabled"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldLoreEntry["constant"]>().toEqualTypeOf<number | null>();
    expectTypeOf<WorldLoreEntry["priority"]>().toEqualTypeOf<number | null>();
    expectTypeOf<WorldLoreEntry["comment"]>().toEqualTypeOf<string | null>();
  });

  test("TransportProgress is the view-model shape", () => {
    expectTypeOf<TransportProgress["name"]>().toEqualTypeOf<string>();
    expectTypeOf<TransportProgress["pct"]>().toEqualTypeOf<number>();
    expectTypeOf<TransportProgress["routeName"]>().toEqualTypeOf<string>();
    expectTypeOf<TransportProgress["nextStopName"]>().toEqualTypeOf<string | null>();
    expectTypeOf<TransportProgress["hazards"]>().toEqualTypeOf<string[]>();
  });
});

describe("world-types travel re-exports", () => {
  test("TransportStatus / PartyStatus / TravelStatusPayload come from travel-wire", () => {
    expectTypeOf<TransportStatus["locationId"]>().toEqualTypeOf<string>();
    expectTypeOf<TransportStatus["routeName"]>().toEqualTypeOf<string>();
    expectTypeOf<TransportStatus["loop"]>().toEqualTypeOf<boolean>();
    expectTypeOf<TransportStatus["progress"]>().toEqualTypeOf<number>();
    expectTypeOf<TransportStatus["stopCount"]>().toEqualTypeOf<number>();
    expectTypeOf<TransportStatus["nextStopName"]>().toEqualTypeOf<string | null>();
    expectTypeOf<TransportStatus["hazards"]>().toEqualTypeOf<string[]>();

    expectTypeOf<PartyStatus["id"]>().toEqualTypeOf<string>();
    expectTypeOf<PartyStatus["status"]>().toEqualTypeOf<string>();
    expectTypeOf<PartyStatus["routeIndex"]>().toEqualTypeOf<number>();
    expectTypeOf<PartyStatus["travelProgress"]>().toEqualTypeOf<number>();
    expectTypeOf<PartyStatus["currentLocationId"]>().toEqualTypeOf<string | null>();
    expectTypeOf<PartyStatus["currentLocationName"]>().toEqualTypeOf<string | null>();

    expectTypeOf<TravelStatusPayload["transports"]>().toEqualTypeOf<TransportStatus[]>();
    expectTypeOf<TravelStatusPayload["parties"]>().toEqualTypeOf<PartyStatus[]>();
  });
});

describe("world-types page state", () => {
  test("WorldPageState exposes the computed getters the template reads", () => {
    expectTypeOf<WorldPageState["hasConditions"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldPageState["timeIcon"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldPageState["weatherIcon"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldPageState["dayNightLabel"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldPageState["forecastAvailable"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldPageState["hasSeason"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldPageState["conditionsAreAuthorSet"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldPageState["detailHazards"]>().toEqualTypeOf<string[]>();
    expectTypeOf<WorldPageState["detailItems"]>().toEqualTypeOf<string[]>();
    expectTypeOf<WorldPageState["resourcesAvailable"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldPageState["optionItems"]>().toEqualTypeOf<WorldLocationLite[]>();
    expectTypeOf<WorldPageState["destinations"]>().toEqualTypeOf<WorldLocationLite[]>();
    expectTypeOf<WorldPageState["travelEtaLabel"]>().toEqualTypeOf<string>();
    expectTypeOf<WorldPageState["travelConnected"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldPageState["edgeToDestination"]>().toEqualTypeOf<WorldEdgeLink | undefined>();
    expectTypeOf<WorldPageState["transportProgresses"]>().toEqualTypeOf<TransportProgress[]>();
    expectTypeOf<WorldPageState["partyStatuses"]>().toEqualTypeOf<PartyStatus[]>();
    expectTypeOf<WorldPageState["loreGroups"]>().toEqualTypeOf<{
      constant: WorldLoreEntry[];
      enabled: WorldLoreEntry[];
      disabled: WorldLoreEntry[];
    }>();
  });

  test("WorldPageState method signatures stay stable", () => {
    expectTypeOf<WorldPageState["init"]>().toEqualTypeOf<() => () => void>();
    expectTypeOf<WorldPageState["loadWorld"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["loadLocations"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["connectConditionsStream"]>().toEqualTypeOf<() => void>();
    expectTypeOf<WorldPageState["applyConditions"]>().toEqualTypeOf<
      (snapshot: WorldConditionsSnapshot,) => void
    >();

    expectTypeOf<WorldPageState["locationById"]>().toEqualTypeOf<
      (id: string,) => WorldLocationLite | undefined
    >();

    expectTypeOf<WorldPageState["connectionIdsOf"]>().toEqualTypeOf<
      (location: WorldLocationLite,) => string[]
    >();

    expectTypeOf<WorldPageState["loadLore"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["openLoreForm"]>().toEqualTypeOf<(id: string | null,) => void>();
    expectTypeOf<WorldPageState["cancelLoreForm"]>().toEqualTypeOf<() => void>();
    expectTypeOf<WorldPageState["saveLore"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["deleteLore"]>().toEqualTypeOf<(id: string,) => Promise<void>>();
    expectTypeOf<WorldPageState["parseLoreKeys"]>().toEqualTypeOf<
      (raw: string | null | undefined,) => string[]
    >();

    expectTypeOf<WorldPageState["selectLocation"]>().toEqualTypeOf<(id: string,) => Promise<void>>();
    expectTypeOf<WorldPageState["loadLocationDetail"]>().toEqualTypeOf<(id: string,) => Promise<void>>();
    expectTypeOf<WorldPageState["loadWorldChats"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["chatsAt"]>().toEqualTypeOf<
      (locationId: string | null,) => WorldChatLite[]
    >();

    expectTypeOf<WorldPageState["moveChatTo"]>().toEqualTypeOf<
      (chatId: string, locationId: string,) => Promise<void>
    >();

    expectTypeOf<WorldPageState["navigateExplore"]>().toEqualTypeOf<() => void>();
    expectTypeOf<WorldPageState["loadGraphEdges"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["loadTravelStatus"]>().toEqualTypeOf<() => Promise<void>>();
    expectTypeOf<WorldPageState["openTravelConfirm"]>().toEqualTypeOf<() => void>();
    expectTypeOf<WorldPageState["confirmTravel"]>().toEqualTypeOf<() => Promise<void>>();
  });

  test("WorldEditState keeps its form + item model", () => {
    expectTypeOf<WorldEditState["locName"]>().toEqualTypeOf<(locId: string | null,) => string>();
    expectTypeOf<WorldEditState["world"]>().toEqualTypeOf<
      {
        id: string;
        name: string;
        description: string | null;
        lore: string | null;
        tags: string[];
      } | null
    >();

    expectTypeOf<WorldEditState["invites"]>().toEqualTypeOf<WorldInviteRow[]>();
    expectTypeOf<WorldEditState["items"][number]["stackable"]>().toEqualTypeOf<boolean>();
    expectTypeOf<WorldEditState["instances"][number]["quantity"]>().toEqualTypeOf<number>();
    expectTypeOf<WorldEditState["copyInviteCode"]>().toEqualTypeOf<(code: string,) => void>();
    expectTypeOf<WorldEditState["revokeInvite"]>().toEqualTypeOf<(inviteId: string,) => Promise<void>>();
  });
});
