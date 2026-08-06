import { describe, test, expect, beforeEach } from "bun:test";
import { registry } from "./registry";
import type { LoadedPlugin, RouteDefinition, ToolDefinition } from "./types";

function makePlugin(name: string, origin: "core" | "community" | "local" = "community"): LoadedPlugin {
  return {
    manifest: {
      name,
      version: "1.0.0",
      description: `Test plugin ${name}`,
      author: "test",
    },
    origin,
    directory: `/tmp/plugins/${name}`,
  };
}

describe("Plugin Registry", () => {
  beforeEach(() => {
    registry.unregisterAll();
  });

  describe("register / getPlugin / listPlugins", () => {
    test("registers and retrieves a plugin", () => {
      const plugin = makePlugin("test-plugin");
      registry.register(plugin);
      expect(registry.getPlugin("test-plugin")).toBe(plugin);
    });

    test("lists all registered plugins", () => {
      registry.register(makePlugin("p1"));
      registry.register(makePlugin("p2"));
      const list = registry.listPlugins();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.manifest.name).sort((a, b) => a.localeCompare(b))).toEqual(["p1", "p2"]);
    });

    test("returns undefined for unknown plugin", () => {
      expect(registry.getPlugin("nonexistent")).toBeUndefined();
    });
  });

  describe("getPluginsByOrigin", () => {
    test("filters by origin", () => {
      registry.register(makePlugin("core-1", "core"));
      registry.register(makePlugin("community-1", "community"));
      registry.register(makePlugin("local-1", "local"));

      expect(registry.getPluginsByOrigin("core")).toHaveLength(1);
      expect(registry.getPluginsByOrigin("community")).toHaveLength(1);
      expect(registry.getPluginsByOrigin("local")).toHaveLength(1);
    });
  });

  describe("routes", () => {
    test("addRoutes and getAllRoutes", () => {
      const route: RouteDefinition = {
        method: "GET",
        path: "/api/test",
        handler: async () => new Response("ok"),
      };
      registry.register(makePlugin("p1"));
      registry.addRoutes("p1", [route]);

      expect(registry.getAllRoutes()).toEqual([route]);
      expect(registry.getPluginRoutes("p1")).toEqual([route]);
      expect(registry.getPluginRoutes("nonexistent")).toEqual([]);
    });

    test("multiple plugins' routes are merged", () => {
      const r1: RouteDefinition = { method: "GET", path: "/a", handler: async () => new Response("a") };
      const r2: RouteDefinition = { method: "POST", path: "/b", handler: async () => new Response("b") };
      registry.register(makePlugin("p1"));
      registry.register(makePlugin("p2"));
      registry.addRoutes("p1", [r1]);
      registry.addRoutes("p2", [r2]);

      expect(registry.getAllRoutes()).toHaveLength(2);
    });
  });

  describe("tools", () => {
    test("addTools and getAllTools", () => {
      const tool: ToolDefinition = {
        name: "test-tool",
        description: "A test tool",
        parameters: {},
        handler: async () => ({ content: "result" }),
      };
      registry.register(makePlugin("p1"));
      registry.addTools("p1", [tool]);

      expect(registry.getAllTools()).toEqual([tool]);
    });
  });

  describe("agentRoles", () => {
    test("getAllAgentRoles and getAgentRole", () => {
      const role = {
        id: "card-battler",
        name: "Card Battler",
        description: "Card combat NPC",
        systemPrompt: "You are a card battler.",
        tools: ["play_card_battle"],
      };
      registry.register(makePlugin("p1"));
      registry.addAgentRoles("p1", [role]);

      expect(registry.getAllAgentRoles()).toEqual([role]);
      expect(registry.getAgentRole("card-battler")).toEqual(role);
    });

    test("getAgentRole returns undefined for unknown id", () => {
      registry.register(makePlugin("p1"));
      registry.addAgentRoles("p1", [{ id: "x", name: "X", description: "", systemPrompt: "", tools: [] }]);

      expect(registry.getAgentRole("missing")).toBeUndefined();
    });
  });

  describe("lifecycle", () => {
    test("unregisterAll clears everything", () => {
      registry.register(makePlugin("p1"));
      registry.addRoutes("p1", [{ method: "GET", path: "/x", handler: async () => new Response("x") }]);

      registry.unregisterAll();

      expect(registry.listPlugins()).toEqual([]);
      expect(registry.getAllRoutes()).toEqual([]);
    });

    test("isEnabled / setEnabled", () => {
      registry.register(makePlugin("p1"));
      expect(registry.isEnabled("p1")).toBe(true);

      registry.setEnabled("p1", false);
      expect(registry.isEnabled("p1")).toBe(false);

      registry.setEnabled("p1", true);
      expect(registry.isEnabled("p1")).toBe(true);
    });

    test("listPluginStates returns all states", () => {
      registry.register(makePlugin("p1"));
      registry.register(makePlugin("p2"));
      registry.setEnabled("p2", false);

      const states = registry.listPluginStates();
      expect(states).toHaveLength(2);
      expect(states.find((s) => s.name === "p1")!.enabled).toBe(true);
      expect(states.find((s) => s.name === "p2")!.enabled).toBe(false);
    });
  });

  describe("eventHandlers", () => {
    test("addEventHandlers and getAllEventHandlers", () => {
      const handler = { event: "test.event", handler: async () => {} };
      registry.register(makePlugin("p1"));
      registry.addEventHandlers("p1", [handler]);

      expect(registry.getAllEventHandlers()).toEqual([handler]);
    });
  });

  describe("migrations", () => {
    test("addMigrations and getAllMigrations", () => {
      const migration = { version: 1, name: "test", up: async () => {} };
      registry.register(makePlugin("p1"));
      registry.addMigrations("p1", [migration]);

      expect(registry.getAllMigrations()).toEqual([migration]);
    });
  });
});
