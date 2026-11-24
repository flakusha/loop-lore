// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression coverage for node-driven template availability: the template
 * route must keep every template visible while saying which ones cannot run,
 * and must never confuse an unreachable ComfyUI with an empty node install.
 * No global fetch stubs or fixed ports: discovery is injected at the seams.
 */
import { describe, expect, test, } from "bun:test";
import type { ImageEditTemplateConfig, } from "../../../../src/config/sections/templates";
import type { ComfyUIClient, } from "../../../../src/generation/providers/comfyui";
import { createLogger, } from "../../../../src/logger";
import type { NodeDiscovery, } from "./node-availability";
import { templateAvailability, } from "./node-availability";
import { ComfyUIEditProvider, } from "./providers/comfyui-provider";
import { handleTemplates, } from "./routes";
import { buildTemplateList, } from "./template-list";
import { registerConfigWorkflows, TemplateRegistry, } from "./template-registry";
import type { WorkflowTemplate, } from "./types";

const COMFY_TEMPLATES = "http://localhost/api/v1/image-edit/templates?backend=comfyui";

// Discovery failures log through the shared logger; bootstrap it like the other
// provider tests so an unreachable stub exercises discovery, not logger setup.
createLogger({ level: "error", },);

interface Availability {
  available: boolean;
  status: string;
  missing_nodes?: string[];
}

interface ListBody {
  data: Array<WorkflowTemplate & { availability: Availability }>;
  node_discovery: { status: string; node_count: number };
}

function template(id: string, required_nodes: string[],): WorkflowTemplate {
  return {
    id,
    name: id,
    description: "",
    category: "txt2img",
    backends: ["comfyui",],
    required_nodes,
    parameters: [],
    build: () => ({}),
  };
}

function discovery(nodes: string[], reachable = true,): NodeDiscovery {
  return { reachable, nodes: new Set(nodes,), };
}

async function list(
  registry: TemplateRegistry,
  nodes: string[],
  reachable = true,
): Promise<ListBody> {
  const res = await handleTemplates(new Request(COMFY_TEMPLATES,), {
    registry,
    discovery: async () => discovery(nodes, reachable,),
  },);

  expect(res.status,).toBe(200,);
  return (await res.json()) as ListBody;
}

describe("GET /templates node availability", () => {
  test("marks absent required nodes unavailable without hiding the template", async () => {
    const registry = new TemplateRegistry();
    registry.register(template("present", ["KSampler",],),);
    registry.register(template("absent", ["Custom.Node",],),);

    const body = await list(registry, ["KSampler",],);

    expect(body.data.map((t,) => t.id),).toEqual(["present", "absent",],);
    expect(body.data[0]!.availability,).toEqual({ available: true, status: "available", },);
    expect(body.data[1]!.availability,).toEqual({
      available: false,
      status: "missing_nodes",
      missing_nodes: ["Custom.Node",],
    },);

    expect(body.node_discovery,).toEqual({ status: "ok", node_count: 1, },);
  });

  test("distinguishes unreachable ComfyUI from zero installed nodes", async () => {
    const registry = new TemplateRegistry();
    registry.register(template("needs-node", ["Custom.Node",],),);

    const unreachable = await list(registry, [], false,);
    const empty = await list(registry, [],);

    expect(unreachable.node_discovery,).toEqual({ status: "unreachable", node_count: 0, },);
    expect(unreachable.data[0]!.availability,).toEqual({ available: false, status: "unreachable", },);
    expect(empty.node_discovery,).toEqual({ status: "ok", node_count: 0, },);
    expect(empty.data[0]!.availability.status,).toBe("missing_nodes",);
  });

  test("never probes ComfyUI for a non-ComfyUI backend", async () => {
    const registry = new TemplateRegistry();
    const sdTemplate = template("sd-only", [],);
    sdTemplate.backends = ["sd-server",];
    registry.register(sdTemplate,);
    let probed = false;

    const res = await handleTemplates(new Request("http://localhost/api/v1/image-edit/templates?backend=sd-server",), {
      registry,
      discovery: async () => {
        probed = true;
        return discovery([],);
      },
    },);

    const body = (await res.json()) as ListBody;
    expect(probed,).toBe(false,);
    expect(body.node_discovery.status,).toBe("not_checked",);
    expect(body.data[0]!.availability,).toEqual({ available: true, status: "not_checked", },);
  });
});

describe("config workflow node requirements", () => {
  test("derives required nodes from distinct graph class types", () => {
    const registry = new TemplateRegistry();
    registerConfigWorkflows({
      workflows: {
        graph: {
          id: "graph",
          name: "Graph",
          category: "txt2img",
          backend: "comfyui",
          description: "",
          nodes: {
            "1": { class_type: "KSampler", inputs: {}, },
            "2": { class_type: "Custom.Node", inputs: {}, },
            "3": { class_type: "KSampler", inputs: {}, },
          },
        },
      },
    } as unknown as ImageEditTemplateConfig, registry,);

    expect(registry.get("graph",)?.required_nodes,).toEqual(["KSampler", "Custom.Node",],);
  });
});

/** Stub client supplied through the provider's protected seam — no sockets. */
class StubProvider extends ComfyUIEditProvider {
  clientCalls = 0;
  fail: boolean;
  nodeNames: string[];

  constructor(nodeNames: string[], ttlMs: number, fail = false,) {
    super({ nodeCacheTtlMs: ttlMs, },);
    this.nodeNames = nodeNames;
    this.fail = fail;
  }

  protected override getClient(): ComfyUIClient {
    this.clientCalls++;
    const self = this;
    return {
      getNodeInfo: async () => {
        if (self.fail) { throw new Error("ECONNREFUSED",); }
        return Object.fromEntries(self.nodeNames.map((name,) => [name, { name, },]),);
      },
    } as unknown as ComfyUIClient;
  }
}

describe("ComfyUI node discovery cache", () => {
  test("caches within the TTL and refreshes only on demand", async () => {
    const provider = new StubProvider(["KSampler",], 60_000,);
    await provider.discoverNodes();
    await provider.discoverNodes();
    expect(provider.clientCalls,).toBe(1,);

    provider.refreshNodes();
    await provider.discoverNodes();
    expect(provider.clientCalls,).toBe(2,);
  });

  test("re-queries once the TTL has elapsed", async () => {
    const provider = new StubProvider(["KSampler",], 0,);
    await provider.discoverNodes();
    await provider.discoverNodes();
    expect(provider.clientCalls,).toBe(2,);
  });

  test("caches unreachable as a distinct result, not an empty install", async () => {
    const down = new StubProvider([], 60_000, true,);
    const result = await down.discoverNodes();
    expect(result.reachable,).toBe(false,);
    expect(result.nodes.size,).toBe(0,);
    await down.discoverNodes();
    expect(down.clientCalls,).toBe(1,);
    expect(await down.getInstalledNodes(),).toEqual(new Set(),);

    const empty = new StubProvider([], 60_000,);
    const healthy = await empty.discoverNodes();
    expect(healthy.reachable,).toBe(true,);
    expect(healthy.nodes.size,).toBe(0,);
  });
});

describe("template availability contract", () => {
  test("non-comfyui backends are not checked", () => {
    expect(templateAvailability({ id: "a", required_nodes: ["X",], }, null, null, null,),).toEqual({
      available: true,
      status: "not_checked",
    },);
  });

  test("unreachable discovery marks templates unavailable", () => {
    expect(templateAvailability({ id: "a", required_nodes: [], }, "comfyui", discovery([], false,), null,),).toEqual({
      available: false,
      status: "unreachable",
    },);
  });

  test("allowed ids win without naming missing nodes", () => {
    expect(
      templateAvailability({ id: "a", required_nodes: ["X",], }, "comfyui", discovery(["X",],), new Set(["a",],),),
    ).toEqual({
      available: true,
      status: "available",
    },);
  });

  test("missing nodes name the absent classes", () => {
    expect(templateAvailability({ id: "a", required_nodes: ["X", "Y",], }, "comfyui", discovery(["X",],), new Set(),),)
      .toEqual({
        available: false,
        status: "missing_nodes",
        missing_nodes: ["Y",],
      },);
  });

  test("buildTemplateList projects summaries with availability", async () => {
    const registry = new TemplateRegistry();
    registry.register(template("a", ["X",],),);
    registry.register(template("b", [],),);
    const result = await buildTemplateList({ backend: "comfyui", category: null, }, {
      registry,
      discover: async () => discovery(["X",],),
    },);

    expect(result.node_discovery,).toEqual({ status: "ok", node_count: 1, },);
    const byId = new Map(result.data.map((summary,) => [summary.id, summary,]),);
    expect(byId.get("a",)?.availability.status,).toBe("available",);
    expect(byId.get("b",)?.availability,).toEqual({ available: true, status: "available", },);
    expect("build" in (byId.get("a",) ?? {}),).toBe(false,);
  });

  test("buildTemplateList reports unreachable discovery", async () => {
    const registry = new TemplateRegistry();
    registry.register(template("a", [],),);
    const result = await buildTemplateList({ backend: "comfyui", category: null, }, {
      registry,
      discover: async () => discovery([], false,),
    },);

    expect(result.node_discovery,).toEqual({ status: "unreachable", node_count: 0, },);
    expect(result.data[0]?.availability.status,).toBe("unreachable",);
  });
});
