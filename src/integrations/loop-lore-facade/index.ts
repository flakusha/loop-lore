// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/integrations/loop-lore-facade/index.ts — the facade module barrel.

export * from "./audit";
export * from "./authz";
export { type FacadeRegistryDeps, getFacadeRegistry, resetFacadeRegistry, } from "./instance";
export { createMcpRoutes, } from "./mcp/routes";
export type { McpCallToolResult, McpTool, } from "./mcp/server";
export { createMcpFacadeServer, MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, } from "./mcp/server";
export { type ChatFacadeDeps, FacadeListMessagesBody, FacadeSendMessageBody, registerChatOps, } from "./ops/chat";
export { type GenerationFacadeDeps, registerGenerationOps, } from "./ops/generation";
export * from "./rate-limit";
export * from "./registry";
export { createFacadeRoutes, } from "./routes";
export * from "./types";
