// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { mcp, } from "../schema-class/json-schema/mcp";
import { MCP_DEFAULTS, } from "../sections/mcp";
import { MCP_TRANSPORTS, } from "./mcp";

describe("MCP config contract", () => {
  test("runtime transports are exactly stdio and http", () => {
    expect([...MCP_TRANSPORTS,],).toEqual(["stdio", "http",],);
  });

  test("defaults stay opt-in with no servers", () => {
    expect(MCP_DEFAULTS.enabled,).toBe(false,);
    expect(MCP_DEFAULTS.servers,).toEqual({},);
  });

  test("JSON schema advertises the same transports as the runtime list", () => {
    const schema = mcp as unknown as {
      properties: {
        servers: { additionalProperties: { properties: { transport: { enum: string[] } } } };
      };
    };
    expect(schema.properties.servers.additionalProperties.properties.transport.enum,)
      .toEqual([...MCP_TRANSPORTS,],);
  });
});
