import "./i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { worldChannels, } from "./world-channels";

interface Toast {
  type: string;
  message: string;
}

/**
 * @param extra
 */
function toastCtx(extra: Record<string, unknown> = {},) {
  const toasts: Toast[] = [];
  return {
    worldJoinCode: "",
    $dispatch(name: string, detail: unknown,) {
      if (name === "show-toast") { toasts.push(detail as Toast,); }
    },
    loadWorldChannels: mock(async () => {
      return;
    },),
    toasts,
    ...extra,
  };
}

describe("worldChannels", () => {
  describe("worldChatGroups", () => {
    test("returns an empty list for an unknown world", () => {
      const ctx = { _worldChats: {}, };
      expect(worldChannels.worldChatGroups!.call(ctx, "w1",),).toEqual([],);
    });

    test("groups chats under their location binding", () => {
      const ctx = {
        _worldChats: {
          w1: [
            { id: "c1", name: "general", current_location_id: "loc-a", location_name: "Town Square", },
            { id: "c2", name: "off-topic", current_location_id: "loc-a", location_name: "Town Square", },
            { id: "c3", name: "tavern", current_location_id: "loc-b", location_name: "The Tavern", },
          ],
        },
      };
      const groups = worldChannels.worldChatGroups!.call(ctx, "w1",);
      expect(groups,).toHaveLength(2,);
      expect(groups[0],).toEqual({
        locationId: "loc-a",
        locationName: "Town Square",
        chats: [
          { id: "c1", name: "general", current_location_id: "loc-a", location_name: "Town Square", },
          { id: "c2", name: "off-topic", current_location_id: "loc-a", location_name: "Town Square", },
        ],
      },);
      expect(groups[1],).toEqual({
        locationId: "loc-b",
        locationName: "The Tavern",
        chats: [{ id: "c3", name: "tavern", current_location_id: "loc-b", location_name: "The Tavern", },],
      },);
    });

    test("buckets chats without a location under 'unlocated'", () => {
      const ctx = {
        _worldChats: {
          w1: [
            { id: "c1", name: "lobby", current_location_id: null, location_name: null, },
            { id: "c2", name: "dms", current_location_id: null, location_name: "Lobby", },
          ],
        },
      };
      const groups = worldChannels.worldChatGroups!.call(ctx, "w1",);
      expect(groups,).toHaveLength(1,);
      expect(groups[0]!.locationId,).toBe("unlocated",);
      expect(groups[0]!.locationName,).toBe("No channel",);
      expect(groups[0]!.chats,).toHaveLength(2,);
    });

    test("does not mix chats across worlds", () => {
      const ctx = {
        _worldChats: {
          w1: [{ id: "c1", name: "general", current_location_id: "loc-a", location_name: "Town", },],
          w2: [{ id: "c2", name: "hall", current_location_id: "loc-a", location_name: "Town", },],
        },
      };
      const groups = worldChannels.worldChatGroups!.call(ctx, "w1",);
      expect(groups[0]!.chats,).toHaveLength(1,);
      expect(groups[0]!.chats[0]!.id,).toBe("c1",);
    });
  });

  describe("joinWorldByCode", () => {
    afterEach(() => {
      const g = globalThis as unknown as Record<string, unknown>;
      delete g.apiFetch;
    },);

    test("warns and skips the network for a blank code", async () => {
      const ctx = toastCtx({ worldJoinCode: " ".repeat(3,), },);
      await worldChannels.joinWorldByCode!.call(ctx,);
      expect(ctx.toasts,).toEqual([{ type: "warning", message: "Enter a world invite code", },],);
      expect(ctx.loadWorldChannels,).not.toHaveBeenCalled();
    });

    test("redeems the code, clears the input, and refreshes the tree", async () => {
      const g = globalThis as unknown as Record<string, unknown>;
      g.apiFetch = mock(async (url: string,) => {
        expect(url,).toBe("/api/world-invites/ABCDEF12/join",);
        return Response.json({ worldId: "w1", alreadyMember: false, }, { status: 200, },);
      },);
      const ctx = toastCtx({ worldJoinCode: "ABCDEF12", },);
      await worldChannels.joinWorldByCode!.call(ctx,);
      expect(ctx.worldJoinCode,).toBe("",);
      expect(ctx.loadWorldChannels,).toHaveBeenCalledTimes(1,);
      expect(ctx.toasts,).toEqual([{ type: "success", message: "Joined world", },],);
    });

    test("treats an already-member response as success", async () => {
      const g = globalThis as unknown as Record<string, unknown>;
      g.apiFetch = mock(async () => Response.json({ worldId: "w1", alreadyMember: true, }, { status: 200, },));
      const ctx = toastCtx({ worldJoinCode: "12345678", },);
      await worldChannels.joinWorldByCode!.call(ctx,);
      expect(ctx.toasts,).toEqual([{ type: "success", message: "Already a member of this world", },],);
      expect(ctx.loadWorldChannels,).toHaveBeenCalledTimes(1,);
    });

    test("surfaces a server-side error message", async () => {
      const g = globalThis as unknown as Record<string, unknown>;
      g.apiFetch = mock(async () => Response.json({ error: "Invite revoked", }, { status: 404, },));
      const ctx = toastCtx({ worldJoinCode: "BROKEN00", },);
      await worldChannels.joinWorldByCode!.call(ctx,);
      expect(ctx.toasts,).toEqual([{ type: "error", message: "Invite revoked", },],);
      expect(ctx.loadWorldChannels,).not.toHaveBeenCalled();
      expect(ctx.worldJoinCode,).toBe("BROKEN00",);
    });

    test("dispatches a network-error toast when the request throws", async () => {
      const g = globalThis as unknown as Record<string, unknown>;
      g.apiFetch = mock(async () => {
        throw new Error("offline",);
      },);
      const ctx = toastCtx({ worldJoinCode: "ABCDEF12", },);
      await worldChannels.joinWorldByCode!.call(ctx,);
      expect(ctx.toasts,).toEqual([{ type: "error", message: "Network error", },],);
    });
  });
});
